#!/bin/sh
set -eu
compiler="$1"
main="$2"
export_docx="$3"
case "$compiler" in
  pdflatex) flag=-pdf ;;
  xelatex) flag=-xelatex ;;
  lualatex) flag=-lualatex ;;
  *) exit 64 ;;
esac
cp -R /input/. /work/
cd /work
base=${main##*/}
base=${base%.tex}
rm -f -- "$base.pdf" "$base.synctex.gz" "$base.docx"
# The runner validates every path component and prefixes the filename with ./.
latexmk "$flag" -g -norc -no-shell-escape -interaction=nonstopmode -synctex=1 -file-line-error "./$main"
if [ "$export_docx" = true ]; then
  pandoc "./$main" -o "$base.docx" --from=latex --to=docx
fi
