FROM docker:29.0.0-cli AS docker_cli
FROM python:3.12.7-alpine
COPY --from=docker_cli /usr/local/bin/docker /usr/local/bin/docker
COPY runner.py /runner.py
CMD ["python3", "-u", "/runner.py"]
