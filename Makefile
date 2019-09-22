EXCLUDES = $(addprefix --exclude , $(shell find . -iname '.*.sw*'))

all: dist

.PHONY: dist
dist:
	rm -f tblatex.xpi
	zip tblatex.xpi $(EXCLUDES) --exclude Makefile --exclude TODO --exclude icon.xcf --exclude tblatex.xpi -r *
