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

	PS.API.findClosestWikipediaArticles:
	------------------------------------
	Function used by the chrome extension to retrieve wikipedia articles close to lat,lng

*/

PS.API.findClosestWikipediaArticles = function(latitude, longitude, options) {

	var _options = {
		radius: 2000,
		limit: 1,
		onComplete: function() {}
	};
	PS.extend(_options, options);

	var url = "http://api.wikilocation.org/articles?lat="+latitude+"&lng="+longitude+"&limit="+_options.limit+"&radius="+_options.radius;
	new PS.Utils.Request(url, {
		onComplete: function(xhr) {
			var json = JSON.parse(xhr.responseText);
			var articles = json.articles;

			// Example:
			//	"id" : "33830839",
			//	"lat" : "51.5006",
			//	"lng" : "-0.12461",
			//	"type" : "landmark",
			//	"title" : "Big Ben",
			//	"url" : "http:\/\/en.wikipedia.org\/w\/index.php?curid=33830839",
			//	"mobileurl" : "http:\/\/en.m.wikipedia.org\/w\/index.php?curid=33830839",
			//	"distance" : "16m"
			_options.onComplete(articles);
		}
	});
};
