"use strict";

var _port = 4000;

var express = require('express');
var async   = require('async');
var exec    = require('child_process').exec;
var fs      = require('fs');
var request = require('request');

var app = express();

app.all('/*', function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");

	if (req.method === 'POST') {

		//This is a very bad way of reading the body of the request
		//TODO: fix this!

		var data = '';
		req.on('data', function (chunk) {
			data += chunk;
		});
		req.on('end', function () {
			req.body = data;
			next();
		});
	}
	else {
		next();
	}
});

var _jobs = [];
var _queue = async.queue(function(task, callback) {

	var cmd = "node linker.js ";
	cmd += "https://photosynth.net/preview/view/" + task.source.guid + "?startat=" + task.source.sIndex + " ";
	cmd += "https://photosynth.net/preview/view/" + task.target.guid + "?startat=" + task.target.sIndex;

	console.log(cmd);

	exec(cmd, function (/*error, stdout, stderr*/) {

		var outputFolder = "connections\\"+task.source.guid + "_" + task.source.sIndex + "__to__" + task.target.guid + "_" + task.target.sIndex+"/";

		fs.readFile(outputFolder+"connection.json", function(err, data) {
			if (err) {
				console.log(err);
			}

			try {
				task.transform = JSON.parse(data);
			}
			catch(error) {}

			request({
					url: 'http://localhost:3000/addConnectionInfo',
					method: 'POST',
					body: JSON.stringify(task)
				},
				function() {
					callback();
				}
			);

		});
	});

}, 1);
app.get('/status', function(req, res) {
	res.send("OK");
});

app.get('/requests', function(req, res) {
	res.send(JSON.stringify(_jobs));
});

app.post('/requests', function(req, res) {

	var linkRequest = JSON.parse(req.body);

	_jobs.push(linkRequest);
	_queue.push(linkRequest, function() {
		//removing job from the _jobs list once it has been executed
		_jobs = _jobs.filter(function(j) { return j !== linkRequest; });
	});

	res.send(JSON.stringify({'queue-length': _jobs.length}));
});
app.get('/', function(req, res) {

	var htmlContent = "";
	htmlContent += "<style>\n";
	htmlContent += "body { font-family: Segoe UI; }\n";
	htmlContent += "</style>\n";

	htmlContent += "<script>\n";
	htmlContent += "function gotoSynth(guid) { if (guid) { window.location.href='/synths/'+guid; }}\n";
	htmlContent += "</script>\n";

	htmlContent += "<h1>Experimental SynthLinker service</h1>\n";
	htmlContent += "<p>There are "+ _jobs.length + " connections to process in the queue.</p>\n";

	if (_jobs.length > 0) {

		htmlContent += "<h3>Actions</h3>\n";

		htmlContent += "<ul>\n";
		htmlContent += "	<li>See all connections: <button onclick=\"window.location.href='/requests'\">go</button></li>\n";
		htmlContent += "</ul>\n";
		htmlContent += "<br />\n";
		htmlContent += "<br />\n";
		htmlContent += "<p>Powered by node.js.</p>\n";
	}
	res.writeHead(200, {'Content-Type': 'text/html'});
	res.end(htmlContent);
});

app.listen(_port);
console.log('Synth linker started on port: ' + _port);
console.log('You can go to http://localhost:' + _port + '/ to see some information about the synth linker');
