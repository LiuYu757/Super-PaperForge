FROM ubuntu:24.04
ARG APT_MIRROR=http://ports.ubuntu.com/ubuntu-ports
RUN sed -i "s|http://ports.ubuntu.com/ubuntu-ports|${APT_MIRROR}|g" /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    texlive-base texlive-latex-base texlive-latex-recommended texlive-latex-extra \
    texlive-fonts-recommended texlive-science texlive-bibtex-extra \
    texlive-xetex texlive-luatex texlive-lang-chinese latexmk biber pandoc \
    && rm -rf /var/lib/apt/lists/*
COPY compile.sh /usr/local/bin/paperforge-compile
RUN chmod 755 /usr/local/bin/paperforge-compile && useradd --uid 10001 --create-home tex
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/paperforge-compile"]
