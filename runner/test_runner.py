import os
import pathlib
import tempfile
import unittest

os.environ.setdefault('RUNNER_HOST_DATA_PATH', '/tmp/paperforge-runner-test')
os.environ.setdefault('TEX_IMAGE_DIGEST', 'sha256:' + 'a' * 64)
import runner


class RunnerInputTests(unittest.TestCase):
    def test_main_path_is_single_relative_tex_path(self):
        self.assertTrue(runner.valid_main('chapters/中文 main.tex'))
        for bad in ('/etc/passwd.tex', '../main.tex', 'a/../main.tex',
                    '-output.tex', 'a/-shell.tex', 'a\\b.tex', 'main.pdf'):
            self.assertFalse(runner.valid_main(bad), bad)

    def test_rejects_symlink_and_fifo_without_following(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / 'main.tex').write_text('test')
            runner.checked_input(root, 'main.tex')
            (root / 'link').symlink_to('/etc/passwd')
            with self.assertRaises(ValueError):
                runner.checked_input(root, 'main.tex')
            (root / 'link').unlink()
            os.mkfifo(root / 'pipe')
            with self.assertRaises(ValueError):
                runner.checked_input(root, 'main.tex')

    def test_rejects_input_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / 'main.tex').write_text('test')
            previous = runner.MAX_INPUT
            try:
                runner.MAX_INPUT = 3
                with self.assertRaises(ValueError):
                    runner.checked_input(root, 'main.tex')
            finally:
                runner.MAX_INPUT = previous


if __name__ == '__main__':
    unittest.main()
