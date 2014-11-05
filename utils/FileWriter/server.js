"use strict";

var http = require('http');
var url  = require("url");
var fs   = require('fs');

http.createServer(function (req, res) {
	var qs = url.parse(req.url, true);
	var query = qs.query;

	var headers = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Length, X-Requested-With'
	}
	res.writeHead(200, headers);

	if (req.method == 'POST') {
		req.pipe(fs.createWriteStream("files/"+query.filename));
		res.end();
	}
	else if (req.method == 'OPTIONS') {
		res.end();
	}
	else {
		res.end('OK');
	}
}).listen(5000);
console.log("File Writer module started");