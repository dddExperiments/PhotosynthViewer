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
	PS.API namespace + utils function to handle request to photosynth REST apis.

*/

//Documentation: https://photosynth.net/api/docs/restapi.html

//jshint -W079
var PS = PS || {};
//jshint +W079

PS.API = {};

PS.API.Filters = {
	None:         "None",
	Synths:       "Synths", //PS1
	Panos:        "Panos",
	SynthPackets: "SynthPackets", //PS2
	All:          "All"
};

PS.API.TimeFilters = {
	Last7Days:  "Last7Days",
	Last30Days: "Last30Days",
	AllTime:    "AllTime"
};

PS.API.OrderBy = {
	Views:     "Views",
	Rank:      "Rank",
	Favorites: "Favorites"
};

PS.API.TextResultOrdering = {
	Descending: "Descending",
	Ascending:  "Ascending"
};

PS.API.TextSortCriteria = {
	BestMatch:     "BestMatch",
	BestSynth:     "BestSynth",
	DateAdded:     "DateAdded",
	NumberOfViews: "NumberOfViews",
	CreatedBy:     "CreatedBy"
};

PS.API.getRootUrl = function() {
	return "https://photosynth.net/rest/2014-08/";
};

PS.API.convertCollection = function(collection) {

	var item = collection;
	var synth = {
		guid:        item.Id,
		name:        item.Name,
		description: item.Description   || "",
		nbFavorites: item.FavoriteCount || 0,
		nbComments:  item.CommentCount  || 0,
		nbViews:     item.Viewings      || 0,
		nbPhotos:    item.ImageCount    || 1,
		privacy:     item.PrivacyLevel  || "",
		thumb:       item.ThumbnailUrl  || "",
		username:    item.OwnerUsername || item.OwnerFriendlyName || "",
		rank:        item.Rank          || 0,
		url:         item.CollectionUrl || "",
		/* jshint -W061 */
		date:        item.CapturedDate ? new Date(eval("new " + item.CapturedDate.replace( /[\\/]/g, "").replace("+0000", ""))) : new Date()
		/* jshint +W061 */
	};

	if (item.Synth) {
		synth.type = "Synth";
		if (item.Synth.SynthinessScore) {
			synth.synthy = item.Synth.SynthinessScore;
		}
	}
	else if (item.Panorama) {
		synth.type = "Panorama";
		if (item.Panorama.Megapixels) {
			synth.megapixels = item.Panorama.Megapixels;
		}
	}
	else if (item.SynthPacket) {
		synth.type = "PS2";
		if (item.SynthPacket.Topology) {
			synth.topology = item.SynthPacket.Topology;
		}
	}
	else {
		synth.type = "Unknown";
	}

	if (item.GeoTag && item.GeoTag.Latitude && item.GeoTag.Longitude/* && item.MapZoomLevel*/) {
		synth.latitude  = item.GeoTag.Latitude;
		synth.longitude = item.GeoTag.Longitude;
		synth.zoomLevel = item.MapZoomLevel || 12; //search nearby Rest API is not returning the zoomLevel
	}
	return synth;
};

PS.API.convertCollections = function(collections) {
	return collections.map(function(c) { return PS.API.convertCollection(c); });
};

PS.API._validateGenericRequestOptions = function(options) {
	options.maxItems = Math.max(options.maxItems, 1);
	options.numRows  = Math.max(options.numRows,  1);
	options.numRows  = Math.min(options.numRows,  100);
	options.numRows  = Math.min(options.maxItems, options.numRows);

	return options;
};

PS.API._genericRequest = function(urlBuilder, options) {
	var _options = {
		numRows: 50,
		filter: "",
		maxItems: 300,
		onProgress: function() {},
		onComplete: function() {},
		onError:    function() {}
	};
	PS.extend(_options, options);
	_options = PS.API._validateGenericRequestOptions(_options);

	new PS.Utils.Request(urlBuilder(0), {
		onComplete: function(xhr) {
			var json = PS.Utils.tryParse(xhr.responseText);
			if (json) {
				var collections  = json.Collections;
				var totalResults = Math.min(json.TotalResults, _options.maxItems);

				if (totalResults > _options.numRows) {
					var nbRequests = Math.ceil(totalResults / _options.numRows) - 1;
					var nbRequested = 0;

					var results = new Array(nbRequests+1);
					results[0] = collections;

					var offsets = PS.Utils.generateRangeArray(nbRequests);
					offsets = offsets.map(function(o) { return (o+1); });

					new PS.Utils.Async.Queue(offsets, {
						concurrency: 8,
						onProcess: function(value, callback) {

							nbRequested++;
							_options.onProgress(nbRequested / nbRequests);

							var offset = value*_options.numRows;
							new PS.Utils.Request(urlBuilder(offset), {
								onComplete: function(xhr) {
									var json = PS.Utils.tryParse(xhr.responseText);
									results[value] = json ? json.Collections : [];
									callback();
								},
								onError: function() {
									results[value] = [];
									callback();
								}
							});
						},
						onComplete: function() {
							var collections = [];
							for (var i=0; i<results.length; ++i) {
								collections = collections.concat(results[i]);
							}
							_options.onComplete(PS.API.convertCollections(collections.slice(0, _options.maxItems)));
						}
					});
				}
				else {
					_options.onComplete(PS.API.convertCollections(collections.slice(0, _options.maxItems)));
				}
			}
			else {
				_options.onError(xhr);
			}
		}
	});
};
