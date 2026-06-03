.PHONY: preview zip

preview:
	cd src && python3 -m http.server 3000

zip:
	cd src && zip -r ../akbun-skin.zip skin.html style.css index.xml $$([ -d images ] && echo images)
