"""Real Docker smoke. Run with TEX_IMAGE_DIGEST set to the built image ID."""
import hashlib
import importlib.util
import json
import os
import pathlib
import tempfile
import uuid

if not os.environ.get('TEX_IMAGE_DIGEST'):
    raise SystemExit('Set TEX_IMAGE_DIGEST to an image ID (sha256:...)')
os.environ['PAPERFORGE_SYNTHETIC_SECRET'] = 'synthetic-secret-never-pass-to-tex'

with tempfile.TemporaryDirectory(prefix='.runner-probe-', dir=os.getcwd()) as temp:
    root = pathlib.Path(temp) / 'compile-data'
    root.mkdir()
    os.environ['RUNNER_HOST_DATA_PATH'] = str(root)
    spec = importlib.util.spec_from_file_location('paperforge_runner', 'runner/runner.py')
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    runner.DATA = root
    runner.HOST_DATA = root
    runner.DEPLOYMENT = 'paperforge-local-probe'
    actual_docker = runner.docker
    inspected = []

    def audited_docker(*args, **kwargs):
        result = actual_docker(*args, **kwargs)
        if args[0] == 'start' and result.returncode == 0:
            container = json.loads(actual_docker('inspect', args[1]).stdout)[0]
            inspected.append(container)
            assert not any('PAPERFORGE_SYNTHETIC_SECRET' in value
                           for value in container['Config']['Env'])
            assert 'synthetic-secret-never-pass-to-tex' not in actual_docker(
                'exec', args[1], 'cat', '/proc/1/environ').stdout
            assert actual_docker('exec', args[1], 'test', '!', '-e',
                                 '/var/run/docker.sock').returncode == 0
            assert actual_docker('exec', args[1], 'test', '!', '-e',
                                 '/opt/paperforge-staging/.env.staging').returncode == 0
            for target in ('1.1.1.1/80', '169.254.169.254/80', '172.21.0.2/5432'):
                assert actual_docker('exec', args[1], 'timeout', '3', 'bash', '-c',
                                     f'echo > /dev/tcp/{target}').returncode != 0
            assert actual_docker('exec', args[1], 'timeout', '3', 'getent',
                                 'hosts', 'example.com').returncode != 0
        return result

    runner.docker = audited_docker

    cases = [
        ('pdflatex', 'main.tex',
         '\\documentclass{article}\n\\begin{document}Runner probe.\\end{document}\n'),
        ('xelatex', '章节/中文 main.tex',
         '\\documentclass{ctexart}\n\\begin{document}你好，世界。\\end{document}\n'),
    ]
    for compiler, main, source in cases:
        job, attempt = str(uuid.uuid4()), str(uuid.uuid4())
        work = root / job / attempt
        target = work / 'input' / main
        target.parent.mkdir(parents=True, mode=0o755)
        (work / 'output').mkdir(mode=0o755)
        target.write_text(source)
        result = runner.execute({'compilationId': job, 'attemptId': attempt,
                                 'mainFile': main, 'compiler': compiler, 'exportDocx': False})
        if not result['success']:
            raise AssertionError(f'{compiler} failed: {result["log"][-1500:]}')
        pdf = (work / 'output' / 'output.pdf').read_bytes()
        assert pdf.startswith(b'%PDF-')
        assert hashlib.sha256(pdf).hexdigest() == result['checksums']['pdf']
        print(f'{compiler} PDF sha256={result["checksums"]["pdf"]} bytes={len(pdf)}')

    assert len(inspected) == len(cases)
    for container in inspected:
        host = container['HostConfig']
        assert host['NetworkMode'] == 'none'
        assert host['ReadonlyRootfs'] is True
        assert host['Privileged'] is False
        assert host['CapDrop'] == ['ALL']
        assert host['PidsLimit'] == 128
        assert host['Memory'] == 2 * 1024 ** 3
        assert host['NanoCpus'] == 1_000_000_000
        assert host['SecurityOpt'] == ['no-new-privileges']
        assert host['Binds'] is None
        assert len(host['Mounts']) == 1 and host['Mounts'][0]['ReadOnly'] is True
        assert all('/var/run/docker.sock' not in str(mount) for mount in container['Mounts'])
    print('Docker inspect and synthetic secret/network probes passed')

    probe = actual_docker('create', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                          '--security-opt', 'no-new-privileges', '--user', '10001:10001',
                          '--tmpfs', '/work:rw,nosuid,nodev,size=128m,uid=10001,gid=10001,mode=700',
                          '--entrypoint', '/bin/sh', runner.IMAGE, '-c', 'sleep 1000000')
    assert probe.returncode == 0
    cid = probe.stdout.strip()
    try:
        assert actual_docker('start', cid).returncode == 0
        output = pathlib.Path(temp) / 'rejected-output'
        output.mkdir()
        for command in ('ln -s /etc/passwd /work/main.pdf',
                        'mkfifo /work/main.pdf',
                        'truncate -s 56M /work/main.pdf'):
            actual_docker('exec', cid, 'rm', '-f', '/work/main.pdf')
            made = actual_docker('exec', cid, 'sh', '-c', command)
            assert made.returncode == 0, made.stderr
            try:
                runner.collect(cid, 'main.tex', output)
            except ValueError:
                pass
            else:
                raise AssertionError(f'unsafe output accepted: {command}')
            assert not any(output.iterdir())
        print('symlink, FIFO, and oversized output rejected')
    finally:
        actual_docker('rm', '-f', cid)

    job, attempt = str(uuid.uuid4()), str(uuid.uuid4())
    work = root / job / attempt
    (work / 'input').mkdir(parents=True, mode=0o755)
    (work / 'output').mkdir(mode=0o755)
    (work / 'input' / 'main.tex').write_text(
        '\\documentclass{article}\n\\begin{document}\\loop\\iftrue\\repeat\\end{document}\n')
    previous_limit = runner.MAX_SECONDS
    runner.MAX_SECONDS = 2
    try:
        timed = runner.execute({'compilationId': job, 'attemptId': attempt,
                                'mainFile': 'main.tex', 'compiler': 'pdflatex',
                                'exportDocx': False})
    finally:
        runner.MAX_SECONDS = previous_limit
    assert timed['success'] is False and not timed['artifacts']
    remaining = actual_docker('ps', '-aq', '--filter', f'label=paperforge.attempt={attempt}')
    assert remaining.returncode == 0 and not remaining.stdout.strip()
    print('bounded compilation timeout removed the entire container')
