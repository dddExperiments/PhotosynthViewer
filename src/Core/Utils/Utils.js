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

	PS.Utils:
	---------
	PS.Utils namespace + utils function

*/

PS.Utils = {};

PS.Utils.generateRangeArray = function(nbItems) {
	var arr = new Array(nbItems);
	for (var i=0; i<nbItems; ++i) {
		arr[i] = i;
	}
	return arr;
};

PS.Utils.ImageDownloader = function(src, callback, corsEnabled) {
	this.img = new Image();
	if (corsEnabled === true) {
		this.img.crossOrigin = "anonymous";
	}
	this.img.onload = function() { callback(null, this); };
	this.img.onerror = function() { callback(this, null); };
	this.img.src = src;
};

PS.Utils.addCSSFile = function(url) {
	var link = document.createElement("link");
	link.setAttribute("rel", "stylesheet");
	link.setAttribute("type", "text/css");
	link.setAttribute("href", url);

	document.getElementsByTagName("head")[0].appendChild(link);
};

PS.Utils.addScriptFile = function(url) {
	var script = document.createElement("script");
	script.setAttribute("type", "text/javascript");
	script.setAttribute("src", url);

	document.getElementsByTagName("head")[0].appendChild(script);
};

PS.Utils.getUrlParams = function() {
	var result = {};
	var params = (window.location.search.split('?')[1] || '').split('&');
	for(var param in params) {
		if (params.hasOwnProperty(param)) {
			var paramParts = params[param].split('=');
			result[paramParts[0]] = decodeURIComponent(paramParts[1] || "");
		}
	}
	return result;
};

PS.Utils.tryParse = function(str) {
	try {
		return JSON.parse(str);
	}
	catch(err) {
		console.warn(err);
		return;
	}
};
