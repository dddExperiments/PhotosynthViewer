# PhotosynthViewer
Photosynth technical preview webgl viewer with photosynth REST API playground.

## Setup
- install latest version of node.js (tested with v0.10.29)
	- http://nodejs.org/download/
	- make sure that node and npm are in the path (npm install was broken for me and I had to create manually C:\Users\YOUR_USERNAME\AppData\Roaming\npm)
- install grunt globally
	- in your command line from anywhere
	- run 'npm install -g grunt-cli'
- install dependencies
	- go to the root of the open source package
	- run 'npm install'
- to enable Bing map demos:
	- open '/web/js/embedScripts.js' and add your own bing map developper key.
	- you can get a key at: http://msdn.microsoft.com/en-us/library/ff428642.aspx
- to enable node.js + mongodb experimental AnnotationStorage (used to store highlight and synth connections) you need to
	- install latest version of mongodb (tested with v2.6.3 - 2014-08-14T17:09:10.503-0700 git version: 255f67a66f9603c59380b2a389e386910bbb52cb)
		- http://www.mongodb.org/downloads
		- make sure that mongod is in the path
	- in the command line go to 'utils/AnnotationStorage'
	- run '__launch.bat' (first time wait for npm install to complete)
	- optionally open your browser at http://localhost:3000 
	- you can import some dumped datasets by running:
		- 'node import.js dump\forest.json'
		- 'node import.js dump\san_francisco_heart.json'
		- 'node import.js dump\puy_en_velay.json'
- to enable node.js experimental SynthLinker (used to create connections between 2 synths to create a virtual tour) you need to
	- in the command line go to 'utils/SynthLinker'
	- run '__launch.bat' (first time wait for npm install to complete)
	- optionally open your browser at http://localhost:4000 

- to view the content available in the /web folder you need a web server
	- You can use the minimal node.js web server (modified from three.js)
		- go to 'utils/SimpleHttpServer/'
		- run '__launch.bat'
		- open your browser at http://localhost:8000
	- OR you can setup apache/IIS to have a webserver pointing to this folder 
		IIS: you need to add the .json mimetype support in IIS + directory listing
		if you are interested in download performance you need to activate gzip compression for .bin files)

## Build
- test only (js lint and unit test)
	- run 'grunt test'
- build only (js and css)
	- run 'grunt build'
- before submitting a pull request (white space cleaning)
	- run 'grunt pre-submit'
- default (test + build)
	- run 'grunt'
- count lines
	- run 'grunt sloc'

## License 
PhotosynthViewer is released under MIT license. For details, see the LICENSE.TXT file.
	
