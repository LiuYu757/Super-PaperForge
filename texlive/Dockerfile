FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-base texlive-latex-base texlive-latex-recommended \
    texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra \
    texlive-science texlive-bibtex-extra texlive-xetex texlive-luatex \
    latexmk biber \
    pandoc \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /compile
