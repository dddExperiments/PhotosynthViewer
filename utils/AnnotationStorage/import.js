"use strict";

var args  = process.argv.slice(2);
var async = require('async');
var fs    = require('fs');
var request = require('request');

if (args.length !== 1) {
	console.log("you need to provide a path to a json file");
}
else {
	fs.readFile(args[0], function(err, data) {
		if (err) {
			console.log(err);
		}
		else {
			var synths = JSON.parse(data);

			var synthQueue = async.queue(function(synth, synthCallback) {

				var guid        = synth.guid;
				var annotations = synth.annotations;

				var annotationQueue = async.queue(function(annotation, annotationCallback) {

					request({
							url: 'http://localhost:3000/synths/' + guid,
							method: 'POST',
							body: JSON.stringify(annotation)
						},
						function() {
							annotationCallback();
						}
					);

				}, 1);

				annotationQueue.drain = function() {
					synthCallback();
				};

				annotations.forEach(function(a) { annotationQueue.push(a); });

			}, 1);
			synths.forEach(function(s) { synthQueue.push(s); });
		}

	});
}
