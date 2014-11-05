"use strict";

/*
	The MIT License (MIT)

	Copyright (c) Microsoft Corporation

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.

	PS.API:
	-------
	Write helper functions for using photosynth REST apis.

*/

/* global CryptoJS */

PS.API.editMedia = function(collectionID, properties, onComplete) {

	var onComplete = onComplete || function() {};

	new PS.Utils.Request(PS.API.getRootUrl() + "media/" + collectionID, {
		method: "POST",
		content: JSON.stringify(properties),
		onComplete: function() {
			onComplete();
		},
		onError: function() {
			onComplete();
		}
	});
};

PS.API.addTag = function(collectionID, tag, onComplete) {

	var onComplete = onComplete || function() {};

	new PS.Utils.Request(PS.API.getRootUrl() + "media/" + collectionID + "/tags?numRows=10&offset=0", {
		method: "POST",
		content: JSON.stringify({
			Tags: [tag]
		}),
		onComplete: function() {
			onComplete();
		},
		onError: function() {
			onComplete();
		}
	});
};

//TODO: remove this function as there is a dependency on CryptoJS here and it should work now with the editMedia Rest API
PS.API.assignGeotag = function(guid, latitude, longitude, zoomLevel, onComplete) {

	var onComplete = onComplete || function() {};

	var content = '<root><GeoPushPin><Latitude>'+latitude+'</Latitude><Longitude>'+longitude+'</Longitude><ZoomLevel>'+zoomLevel+'</ZoomLevel></GeoPushPin></root>';
	var hash = CryptoJS.SHA1(content).toString();
	var url = '/photosynthws/upload.psfx?c='+guid+'&h='+hash+'&a=sha1&t=edited';

	new PS.Utils.Request(url, {
		method: "POST",
		content: content,
		onComplete: function() {
			onComplete();
		},
		onError: function() {
			onComplete();
		}
	});
};

PS.API.removeGeoAlignmentSoap = function(guid, onComplete) {

	var onComplete = onComplete || function() {};

	var content = "";
	content += "<?xml version='1.0' encoding='utf-8'?>";
	content += "<soap12:Envelope xmlns:xsi='http://www.w3.orgf589631b-1d74-47ac-a09e-6fe6590df796/2001/XMLSchema-instance' xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:soap12='http://www.w3.org/2003/05/soap-envelope'>";
	content += "  <soap12:Body>";
	content += "    <DeleteGeotag xmlns='http://labs.live.com/'>";
	content += "      <collectionId>"+guid+"</collectionId>";
	content += "      <alignmentOnly>true</alignmentOnly>";
	content += "    </DeleteGeotag>";
	content += "  </soap12:Body>";
	content += "</soap12:Envelope>";

	new PS.Utils.Request("/photosynthws/PhotosynthService.asmx", {
		method: "POST",
		content: content,
		headers: [
			{ name: "Content-Type", value: "application/soap+xml; charset=utf-8" }
		],
		onComplete: function() {
			onComplete();
		},
		onError: function() {
			onComplete();
		}
	});
};

PS.API.fixMyCapturedDate = function(username) {
	PS.API.getListOfUserSynth(username, {
		filter: "SynthPackets",
		onComplete: function(collections) {

			new PS.Utils.Async.Queue(PS.Utils.generateRangeArray(collections.length), {
				concurrency: 8,
				onProcess: function(index, callback) {
					var collection = collections[index];
					new PS.Utils.Request(collection.CollectionUrl, {
						onComplete: function(xhr) {
							var json = JSON.parse(xhr.responseText);
							var cameras = json.cameras;
							var firstCameraTimestamp = cameras[0].timestamp;
							if (firstCameraTimestamp && firstCameraTimestamp !== -1) {
								var capturedDate = new Date(firstCameraTimestamp*1000);

								PS.API.editMedia(collection.Id, {
									CapturedDate: "/Date("+capturedDate.getTime()+"+0000)/"
								}, function() {
									callback();
								});
							}
							callback();
						},
						onError: function() {
							callback();
						}
					});
				},
				onComplete: function() {
					alert("done");
					/*
					collections.sort(function(a, b) {
						var d1 = eval("new " + (a.CapturedDate.replace( /[\\/]/g, "")).replace("+0000", ""));
						var d2 = eval("new " + (b.CapturedDate.replace( /[\\/]/g, "")).replace("+0000", ""));
						return d1.getTime() - d2.getTime();
					});
					console.log(collections);
					console.log(collections.map(function(c) { return c.Name; }));
					*/
				}
			});
		}
	});
};

PS.API.fixMyGPS = function(username) {
	PS.API.getListOfUserSynth(username, {
		onComplete: function(collections) {

			new PS.Utils.Async.Queue(PS.Utils.generateRangeArray(collections.length), {
				concurrency: 8,
				onProcess: function(index, callback) {
					var collection = collections[index];

					if (collection.zoomLevel) {

						PS.API.assignGeotag(collection.guid, collection.latitude, collection.longitude, collection.zoomLevel, function() {

							PS.API.getInfoSoap(collection.guid, function(xml) {

								var needToBeFixed = false;
								var alignments = xml.getElementsByTagName("GeoAlignment");
								if (alignments.length > 0) {
									var scales = alignments[0].getElementsByTagName("Scale");
									if (scales.length > 0) {
										var scale = scales[0].firstChild.nodeValue;
										if (scale === 0) {
											needToBeFixed = true;
											PS.API.removeGeoAlignmentSoap(collection.guid, function() {
												callback();
											});
										}
									}
								}

								if (!needToBeFixed) {
									callback();
								}

							});

						});
					}
					else {
						callback();
					}
				},
				onComplete: function() {
					alert("done");
				}
			});

		}
	});
};
