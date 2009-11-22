all: debug_template dist upload

release: release_template dist

dist:
	rm -f tblatex.xpi
	zip tblatex.xpi --exclude Makefile --exclude oldext --exclude tests --exclude TODO --exclude install.rdf.template -r *

upload:
	echo "cd jonathan/files\nput tblatex.xpi" | ftp xulforum@ftp.xulforum.org

debug_template:
	cp -f install.rdf.template install.rdf
	sed -i s/__REPLACEME__/pre\.$(shell date +%y%m%d)/ install.rdf

release_template:
	cp -f install.rdf.template install.rdf
	sed -i s/__REPLACEME__// install.rdf
