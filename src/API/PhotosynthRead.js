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
	Read-only helper functions for using photosynth REST apis.

*/

PS.API.getUsername = function(onComplete) {

	new PS.Utils.Request(PS.API.getRootUrl() + "me", {
		onComplete: function(xhr) {
			var json = PS.Utils.tryParse(xhr.responseText);
			onComplete(json ? json.Username : "");
		},
		onError: function() {
			onComplete("");
		}
	});
};

PS.API.getMedia = function(collectionID, onComplete) {

	new PS.Utils.Request(PS.API.getRootUrl() + "media/" + collectionID, {
		onComplete: function(xhr) {
			var json = PS.Utils.tryParse(xhr.responseText);
			onComplete(json ? PS.API.convertCollection(json) : null);
		},
		onError: function() {
			onComplete();
		}
	});
};

PS.API.getAnnotations = function(collectionID, onComplete) {

	new PS.Utils.Request(PS.API.getRootUrl() + "media/" + collectionID+"/annotations", {
		onComplete: function(xhr) {
			var json = PS.Utils.tryParse(xhr.responseText);
			if (json) {
				var annotations = json.map(function(a) {

					var visibilityPreset = {
						'Auto':   0,
						'All':    1,
						'One':    2,
						'Manual': 3
					};

					return {
						worldPoint:         a.Placement.WorldPoint,
						queryPoint:         a.Placement.QueryPoint,
						visibility:         a.Placement.Visibility,
						visibilityPreset:   visibilityPreset[a.Placement.Preset],
						radius:             a.Placement.Radius,
						text:               a.Description,
						dbid:               a.AnnotationId.toString(),
						imgIndex:           a.Placement.ImageIndex,
						surfaceOrientation: a.Placement.Orientation
					};
				});
				onComplete(annotations);
			}
			else {
				onComplete([]);
			}
		},
		onError: function() {
			onComplete([]);
		}
	});
};

PS.API.getPS2Url = function(guid, onComplete) {
	PS.API.getMedia(guid, function(synth) {
		if (synth) {
			if (synth.type === "PS2") {
				var packetUrl = synth.url.replace("0.json", "");
				onComplete(packetUrl);
			}
			else {
				onComplete();
			}
		}
		else {
			onComplete();
		}
	});
};

PS.API.getListOfMostRecentSynths = function(options) {

	var _options = {
		numRows: 50,
		filter: "",
		maxItems: 300,
		onProgress: function() {},
		onComplete: function() {}
	};
	PS.extend(_options, options);
	_options = PS.API._validateGenericRequestOptions(_options);

	function getUrl(offset) {
		var url = PS.API.getRootUrl() + "media/explore/?order=Date&numRows="+_options.numRows+"&offset="+offset;
		if (_options.filter) {
			url += "&collectionTypeFilter=" + _options.filter;
		}
		return url;
	}

	PS.API._genericRequest(getUrl, _options);
};

PS.API.getListOfMostFavoriteSynths = function(options) {

	var _options = {
		numRows: 50,
		filter: "",
		maxItems: 300,
		onProgress: function() {},
		onComplete: function() {},
		timeFilter: PS.API.TimeFilters.Last7Days,
		order: PS.API.OrderBy.Favorites
	};
	PS.extend(_options, options);
	_options = PS.API._validateGenericRequestOptions(_options);

	function getUrl(offset) {
		var url = PS.API.getRootUrl() + "media/explore/?order="+_options.order+"&time="+_options.timeFilter+"&numRows="+_options.numRows+"&offset="+offset;
		if (_options.filter) {
			url += "&collectionTypeFilter=" + _options.filter;
		}
		return url;
	}

	PS.API._genericRequest(getUrl, _options);
};

PS.API.getListOfFavoriteUserSynth = function(username, options) {

	var _options = {
		numRows: 50,
		filter: "",
		maxItems: 300,
		onProgress: function() {},
		onComplete: function() {}
	};
	PS.extend(_options, options);
	_options = PS.API._validateGenericRequestOptions(_options);

	function getUrl(offset, username) {
		var url = PS.API.getRootUrl() + "users/"+username+"/favorites?numRows="+_options.numRows+"&offset="+offset;
		if (_options.filter) {
			url += "&collectionTypeFilter=" + _options.filter;
		}
		return url;
	}

	PS.API._genericRequest((function() {
		var user = username;
		return function(offset) {
			return getUrl(offset, user);
		};
	})(), _options);
};

PS.API.getListOfUserSynth = function(username, options) {

	var _options = {
		numRows: 50,
		filter: "",
		maxItems: 300,
		onProgress: function() {},
		onComplete: function() {}
	};
	PS.extend(_options, options);
	_options = PS.API._validateGenericRequestOptions(_options);

	function getUrl(offset, username) {
		var url = PS.API.getRootUrl() + "users/"+username+"/media?numRows="+_options.numRows+"&offset="+offset;
		if (_options.filter) {
			url += "&collectionTypeFilter=" + _options.filter;
		}
		return url;
	}

	PS.API._genericRequest((function() {
		var user = username;
		return function(offset) {
			return getUrl(offset, user);
		};
	})(), _options);
};

PS.API.textSearchForSynths = function(queryText, options) {

	var _options = {
		numRows: 50,
		filter: "",
		maxItems: 300,
		onProgress: function() {},
		onComplete: function() {},
		sort: PS.API.TextSortCriteria.BestMatch,
		ordering: PS.API.TextResultOrdering.Descending
	};
	PS.extend(_options, options);
	_options = PS.API._validateGenericRequestOptions(_options);

	function getUrl(offset, text, sort, ordering) {
		var url = PS.API.getRootUrl() + "search/?numRows="+_options.numRows+"&offset="+offset+"&sortby="+sort+"&orderby="+ordering+"&q="+encodeURI(text);
		if (_options.filter) {
			url += "&collectionTypeFilter=" + _options.filter;
		}
		return url;
	}

	PS.API._genericRequest((function() {
		var text     = queryText;
		var sort     = _options.sort;
		var ordering = _options.ordering;

		return function(offset) {
			return getUrl(offset, text, sort, ordering);
		};
	})(), _options);
};

PS.API.getNearestSynthsByBBox = function(southLatitude, westLongitude, northLatitude, eastLongitude, options) {

	var _options = options || {};
	_options.mode = "bbox";
	_options.nlat = northLatitude;
	_options.elon = eastLongitude;

	PS.API.getNearestSynths(southLatitude, westLongitude, _options);
};

PS.API.getNearestSynthsByRadius = function(latitude, longitude, options) {

	var _options = options || {};
	_options.mode = "nearby";

	PS.API.getNearestSynths(latitude, longitude, options);
};

PS.API.getNearestSynths = function(latitude, longitude, options) {

	var _options = {
		mode: "nearby",
		slat: latitude,
		wlon: longitude,
		nlat: latitude,
		elon: longitude,
		numRows: 50,
		filter: "",
		radius: 2000,
		maxItems: 500,
		loggedUser: "", //useful to blacklist the logged user (not implemented)
		onProgress: function() {},
		onComplete: function() {}
	};
	PS.extend(_options, options);
	_options = PS.API._validateGenericRequestOptions(_options);

	function getUrl(offset) {
		var url = PS.API.getRootUrl() + "search/" + _options.mode + "?numRows="+_options.numRows+"&offset="+offset;
		if (_options.mode === "nearby") {
			url += '&lat=' + _options.slat+'&lon=' + _options.wlon + '&radius=' + _options.radius;
		}
		else {
			url += '&slat=' + _options.slat + '&wlon=' + _options.wlon + '&nlat=' + _options.nlat + '&elon=' + _options.elon;
		}
		if (_options.filter) {
			url += "&collectionTypeFilter=" + _options.filter;
		}
		return url;
	}

	PS.API._genericRequest(getUrl, _options);
};

PS.API.getInfoSoap = function(guid, onComplete) {

	var content = "";
	content += "<?xml version='1.0' encoding='utf-8'?>";
	content += "<soap12:Envelope xmlns:xsi='http://www.w3.orgf589631b-1d74-47ac-a09e-6fe6590df796/2001/XMLSchema-instance' xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:soap12='http://www.w3.org/2003/05/soap-envelope'>";
	content += "  <soap12:Body>";
	content += "    <GetCollectionData xmlns='http://labs.live.com/'>";
	content += "      <collectionId>"+guid+"</collectionId>";
	content += "      <incrementEmbedCount>false</incrementEmbedCount>";
	content += "    </GetCollectionData>";
	content += "  </soap12:Body>";
	content += "</soap12:Envelope>";

	new PS.Utils.Request("/photosynthws/PhotosynthService.asmx", {
		method: "POST",
		content: content,
		headers: [
			{ name: "Content-Type", value: "application/soap+xml; charset=utf-8" }
		],
		onComplete: function(xhr) {
			onComplete(xhr.responseXML);
		},
		onError: function() {
			onComplete();
		}
	});
};

PS.API.getSynths = function(mode, onComplete) {

	var onComplete = onComplete || function() {};

	var form = new FormData();
	form.append("collectionId", "");
	form.append("cmd", mode === "mostViewed" ? "retrievemostviewedsynths" : "retrieverecentsynths");
	form.append("text", "48,0,Last7Days,4,False");

	new PS.Utils.Request("/PhotosynthHandler.ashx", {
		method: "POST",
		content: form,
		onComplete: function(xhr) {
			onComplete(JSON.parse(xhr.responseText).Collections);
		},
		onError: function() {
			onComplete([]);
		}
	});
};
