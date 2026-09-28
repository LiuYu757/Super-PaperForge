"""Fixed-policy, deployment-local TeX runner. Only this service gets docker.sock."""
import http.server
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import threading
import time

DATA = pathlib.Path(os.environ.get('RUNNER_DATA_PATH', '/compile-data')).resolve()
HOST_DATA = pathlib.Path(os.environ['RUNNER_HOST_DATA_PATH'])
IMAGE = os.environ['TEX_IMAGE_DIGEST']
DEPLOYMENT = os.environ.get('RUNNER_DEPLOYMENT_ID', 'paperforge-staging')
MAX_SECONDS = 120
MAX_LOG = 2 * 1024 * 1024
MAX_INPUT = 100 * 1024 * 1024
MAX_OUTPUT = 55 * 1024 * 1024
UUID = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', re.I)
running = {}
cancelled = set()
lock = threading.Lock()
compile_slot = threading.BoundedSemaphore(1)


def docker(*args, timeout=20):
    return subprocess.run(['docker', *args], capture_output=True, text=True, timeout=timeout)


def valid_uuid(value):
    return isinstance(value, str) and bool(UUID.fullmatch(value))


def valid_main(value):
    return (isinstance(value, str) and value.endswith('.tex') and len(value) <= 512
            and not value.startswith('/') and '\\' not in value
            and all(part not in ('', '.', '..') and not part.startswith('-')
                    for part in value.split('/'))
            and not any(ord(char) < 32 for char in value))


def checked_input(root, main):
    if not root.is_dir() or root.is_symlink():
        raise ValueError('input directory missing or symbolic link')
    total = 0
    count = 0
    for current, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            item = pathlib.Path(current) / name
            mode = item.lstat().st_mode
            if stat.S_ISDIR(mode):
                continue
            if not stat.S_ISREG(mode) or item.stat().st_nlink != 1:
                raise ValueError('input contains link or special file')
            total += item.stat().st_size
            count += 1
            if total > MAX_INPUT or count > 500:
                raise ValueError('input limit exceeded')
    target = root / main
    if not target.is_file() or target.is_symlink():
        raise ValueError('main file missing')


def collect(cid, main, output):
    stem = pathlib.PurePosixPath(main).name[:-4]
    result = {}
    checksums = {}
    total = 0
    for extension, label in (('.pdf', 'pdf'), ('.synctex.gz', 'synctex'), ('.docx', 'docx')):
        source = f'/work/{stem}{extension}'
        destination = output / f'output{extension}'
        info = docker('exec', cid, 'stat', '-c', '%F|%s|%h', '--', source)
        if info.returncode != 0:
            continue
        kind, size, links = info.stdout.strip().split('|')
        if kind != 'regular file' or links != '1' or int(size) > MAX_OUTPUT:
            raise ValueError('unsafe or oversized output')
        total += int(size)
        if total > MAX_OUTPUT:
            raise ValueError('output total limit exceeded')
        digest = hashlib.sha256()
        read = 0
        process = subprocess.Popen(['docker', 'exec', cid, 'cat', source],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            with destination.open('xb') as target:
                while True:
                    chunk = process.stdout.read(65536)
                    if not chunk:
                        break
                    read += len(chunk)
                    if read > int(size) or read > MAX_OUTPUT:
                        raise ValueError('output grew while collecting')
                    digest.update(chunk)
                    target.write(chunk)
            if process.wait(timeout=10) != 0 or read != int(size):
                raise ValueError('output changed or stream failed')
        except Exception:
            process.kill()
            process.wait(timeout=5)
            destination.unlink(missing_ok=True)
            raise
        result[label] = destination.name
        checksums[label] = digest.hexdigest()
    return result, checksums


def execute(request):
    job, attempt = request.get('compilationId'), request.get('attemptId')
    main, compiler = request.get('mainFile'), request.get('compiler')
    if not valid_uuid(job) or not valid_uuid(attempt) or not valid_main(main):
        raise ValueError('invalid job, attempt or main file')
    if compiler not in ('pdflatex', 'xelatex', 'lualatex') or type(request.get('exportDocx')) is not bool:
        raise ValueError('invalid compile options')
    with lock:
        if attempt in cancelled:
            return {'success': False, 'cancelled': True, 'log': 'Cancelled before container start',
                    'durationMs': 0, 'artifacts': {}, 'checksums': {}, 'imageDigest': IMAGE}
    root = DATA / job / attempt
    source = root / 'input'
    output = root / 'output'
    for directory in (DATA / job, root, source):
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError('attempt path is not a real directory')
    if not source.resolve().is_relative_to(DATA):
        raise ValueError('attempt path escapes data root')
    checked_input(source, main)
    if output.is_symlink():
        raise ValueError('output directory is symbolic link')
    output.mkdir(mode=0o755, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('attempt output already exists')
    inspect = docker('image', 'inspect', IMAGE, '--format', '{{.Id}}')
    if inspect.returncode != 0 or inspect.stdout.strip() != IMAGE:
        raise RuntimeError('approved TeX image digest is unavailable or mismatched')
    name = f'pf-{DEPLOYMENT}-{job}-{attempt}'
    create = docker('create', '--name', name,
                    '--label', f'paperforge.deployment={DEPLOYMENT}',
                    '--label', f'paperforge.compilation={job}',
                    '--label', f'paperforge.attempt={attempt}',
                    '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                    '--security-opt', 'no-new-privileges', '--user', '10001:10001',
                    '--cpus', '1', '--memory', '2g', '--memory-swap', '2g',
                    '--pids-limit', '128', '--init',
                    '--log-driver', 'none',
                    '--env', 'HOME=/work',
                    '--env', 'XDG_CACHE_HOME=/work/.cache',
                    '--env', 'TEXMFCACHE=/work/.texlive-cache',
                    '--env', 'TMPDIR=/work',
                    '--tmpfs', '/work:rw,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=700',
                    '--mount', f'type=bind,source={HOST_DATA / job / attempt / "input"},target=/input,readonly',
                    '--entrypoint', '/bin/sh', IMAGE, '-c', 'sleep 1000000')
    if create.returncode != 0:
        raise RuntimeError('Docker rejected fixed compile policy: ' + create.stderr[-500:])
    cid = create.stdout.strip()
    with lock:
        running[attempt] = cid
    started = time.monotonic()
    timed_out = False
    try:
        with lock:
            cancelled_before_start = attempt in cancelled
        if cancelled_before_start:
            return {'success': False, 'cancelled': True, 'log': 'Cancelled before container start',
                    'durationMs': 0, 'artifacts': {}, 'checksums': {}, 'imageDigest': IMAGE}
        started_proc = docker('start', cid)
        if started_proc.returncode != 0:
            raise RuntimeError('Docker could not start fixed-policy container: ' + started_proc.stderr[-500:])
        process = subprocess.Popen(['docker', 'exec', cid, '/usr/local/bin/paperforge-compile',
                                    compiler, main, 'true' if request['exportDocx'] else 'false'],
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        chunks = bytearray()

        def drain_output():
            while True:
                chunk = process.stdout.read(65536)
                if not chunk:
                    break
                chunks.extend(chunk)
                if len(chunks) > MAX_LOG:
                    del chunks[:-MAX_LOG]

        reader = threading.Thread(target=drain_output, daemon=True)
        reader.start()
        try:
            exit_code = process.wait(timeout=MAX_SECONDS)
        except subprocess.TimeoutExpired:
            timed_out = True
            docker('kill', cid)
            process.wait(timeout=10)
            exit_code = process.returncode
        reader.join(timeout=5)
        log = bytes(chunks).decode('utf8', errors='replace')
        with lock:
            was_cancelled = attempt in cancelled
        artifacts, checksums = ({}, {}) if timed_out or was_cancelled else collect(cid, main, output)
        return {'success': exit_code == 0 and not timed_out and 'pdf' in artifacts,
                'cancelled': was_cancelled,
                'log': log, 'durationMs': int((time.monotonic() - started) * 1000),
                'artifacts': artifacts, 'checksums': checksums, 'imageDigest': IMAGE}
    finally:
        docker('rm', '-f', cid)
        with lock:
            running.pop(attempt, None)
            cancelled.discard(attempt)


class Handler(http.server.BaseHTTPRequestHandler):
    def reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == '/health':
            self.reply(200, {'imageDigest': IMAGE, 'deployment': DEPLOYMENT})
        else:
            self.reply(404, {'error': 'not found'})

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 2 or size > 4096:
                raise ValueError('invalid request size')
            body = json.loads(self.rfile.read(size))
            if self.path == '/run':
                if not compile_slot.acquire(blocking=False):
                    self.reply(429, {'error': 'one compile is already running'})
                    return
                try:
                    self.reply(200, execute(body))
                finally:
                    compile_slot.release()
            elif self.path == '/cancel':
                attempt = body.get('attemptId')
                if not valid_uuid(attempt):
                    raise ValueError('invalid attempt')
                with lock:
                    cid = running.get(attempt)
                    cancelled.add(attempt)
                if cid:
                    docker('kill', cid)
                # A runner restart may have lost memory; labels are scoped to this deployment.
                lookup = docker('ps', '-aq', '--filter', f'label=paperforge.deployment={DEPLOYMENT}',
                                '--filter', f'label=paperforge.attempt={attempt}')
                if lookup.returncode != 0:
                    raise RuntimeError('cannot inspect attempt containers')
                for container in lookup.stdout.splitlines():
                    docker('rm', '-f', container)
                remaining = docker('ps', '-aq', '--filter', f'label=paperforge.deployment={DEPLOYMENT}',
                                   '--filter', f'label=paperforge.attempt={attempt}')
                if remaining.returncode != 0 or remaining.stdout.strip():
                    raise RuntimeError('attempt container still exists')
                self.reply(200, {'stopped': True})
            else:
                self.reply(404, {'error': 'not found'})
        except (ValueError, json.JSONDecodeError) as error:
            self.reply(400, {'error': str(error)})
        except Exception as error:
            self.reply(503, {'error': str(error)[:500]})


if __name__ == '__main__':
    if not re.fullmatch(r'[a-zA-Z0-9-]{1,32}', DEPLOYMENT) or not re.fullmatch(r'sha256:[a-f0-9]{64}', IMAGE):
        raise SystemExit('runner requires fixed deployment ID and sha256 TeX image ID')
    if DATA != pathlib.Path('/compile-data') or HOST_DATA != pathlib.Path('/opt/paperforge-staging/compile-data'):
        raise SystemExit('runner data paths must match the dedicated staging bind mount')
    DATA.mkdir(parents=True, exist_ok=True)
    # Interrupted runs cannot be trusted after a runner restart.
    abandoned = docker('ps', '-aq', '--filter', f'label=paperforge.deployment={DEPLOYMENT}')
    for container in abandoned.stdout.splitlines():
        docker('rm', '-f', container)
    http.server.ThreadingHTTPServer(('0.0.0.0', 8765), Handler).serve_forever()
