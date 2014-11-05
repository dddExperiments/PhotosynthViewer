"use strict";

var express = require('express');
var synths = require('./routes/synths');

var app = express();

app.configure(function() {
});

app.all('/*', function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");

	if (req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT' || req.method === 'OPTIONS') {

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

app.get('/status', function(req, res) {
	res.send("OK");
});
app.get('/clear',         synths.clear);
app.get('/synths',        synths.findAll);
app.get('/synths/:id',    synths.findByGuid);
app.post('/synths/:id',   synths.insertAnnotation);
app.put('/synths/:id',    synths.updateAnnotation);
app.delete('/synths/:id', synths.deleteAnnotation);

app.post('/addConnectionInfo', synths.addConnectionInfo);

app.listen(3000);
console.log('Listening on port 3000...');
