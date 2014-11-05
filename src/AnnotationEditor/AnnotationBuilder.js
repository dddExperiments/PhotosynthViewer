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

	PS.Packet.Annotation.Builder:
	-----------------------------
	When the user is clicking on an image to create an annotation we need to estimate:
	- a 3d position for the annotation (by intersecting the ray with the local geometry)
	- a visibility range (= when to start, stop displaying annotation).

	Visibility range can be determined with an heuristic or using the point sparse cloud visibility information.
	We are using the heuristic in production as it doesn't require downloading the point cloud for the user.

	This class is responsible for computing position and visibility range by querying underlying service.

*/

PS.Packet.Annotation.Builder = function(alwaysUseHeuristic) {

	function PointInfo(distance, pcIndex, pointIndex) {
		this.distance        = distance;
		this.pointCloudIndex = pcIndex;
		this.pointIndex      = pointIndex;
	}

	var _player;
	var _geometryService   = new PS.Packet.Annotation.GeometryService();
	var _pointCloudService = new PS.Packet.Annotation.VisibilityService();
	var _heuristicService  = new PS.Packet.Annotation.VisibilityServiceFallback();
	var _usePointCloudForVisibility = !alwaysUseHeuristic;

	this.init = function(player) {
		_player = player;
		var dataset = player.packetViewer.dataset;
		if (dataset.nbPointCloudFiles !== 0 && _usePointCloudForVisibility) {
			_pointCloudService.init(dataset.rootUrl, dataset.nbPointCloudFiles);
		}
		else {
			_heuristicService.init(dataset);
		}
	};

	this.getPositionAndVisibility = function(point, geomIndex, camIndex, camera, onComplete) {
		//point is expressed in image coordinates [0, 1]
		_geometryService.getGeometryPlane(_player.packetViewer.dataset.rootUrl, geomIndex, camIndex, point, function(plane) {
			if (plane.depth) {

				var intersectedPlane = new PS.Packet.Plane(new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z), plane.depth);
				var res = camera.intersectPoint(intersectedPlane, (point.x-0.5)*2, (point.y-0.5)*-2);

				if (res.isFront) {

					var worldPoint = res.p;
					var surfaceOrientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(worldPoint, worldPoint.clone().sub(plane.normal), new THREE.Vector3(0, 0, 1)));

					//COMMON CASE: we have point cloud data, we can use them to get visibility information
					if (_player.packetViewer.dataset.nbPointCloudFiles !== 0 && _usePointCloudForVisibility) {

						//get all 3d points visible from that camera
						var points = _pointCloudService.getFeatureVisibleInCamera(camera.index);

						//only keep the one closest to the query point in 2D
						var selectedPoints = findPointsCloseToQueryPoint(camera, points, point);

						//merge the visibility information of the 3d points close to the query point
						var visibility = _pointCloudService.getVisibilityInformation(selectedPoints.map(function(p) { return [p.pointCloudIndex, p.pointIndex]; }));

						//call the callback with the result
						onComplete(worldPoint, visibility, worldPoint.distanceTo(camera.pose.position), camera.sIndex, point.clone(), surfaceOrientation);
					}
					//EDGE CASE: we don't have point cloud data in case of ice-mode panorama or dataset uploaded manually by Mike Krainin (David Breashears everest)
					//Example:
					//ab91f4be-134c-4e53-b74f-7ed34218e00b: uploaded by Mike for me
					//252f9d8a-db73-4ecd-8089-ab4a4d8bf50b: uploaded by Mike
					//cd18bea0-6832-4547-99f4-0d8efba3cb6d: ice-panorama
					else {

						var visibility = _heuristicService.getVisibilityInformation(camera.sIndex);

						//call the callback with the result
						onComplete(worldPoint, visibility, worldPoint.distanceTo(camera.pose.position), camera.sIndex, point.clone(), surfaceOrientation);
					}
				}
			}
		});
	};

	function findPointsCloseToQueryPoint(camera, points, point) {
		/*
			we have a list of 3d points visible from a camera
			we have the query point x,y in 2d where the user click

			The goal is to return all 3d points in a 45px radius around the query point
			Thus I'm projecting the 3d point using the camera projection matrix and sorting them by distance.
			Then I'm only keeping the ones within the 45px radius or adding the closest one if none are within the radius
		*/

		var w = camera.originalSize.x;
		var h = camera.originalSize.y;
		var queryPoint = new THREE.Vector2(point.x*w, point.y*h);

		var nbPoints = points.length / 5;

		var projectionMatrix = camera.textureMatrix;
		var worldPoint = new THREE.Vector3();

		var vertexOffset = 0;
		var currentPoint = new THREE.Vector2();
		var dists = new Array(nbPoints);
		for (var i=0; i<nbPoints; ++i) {
			worldPoint.set(points[vertexOffset++], points[vertexOffset++], points[vertexOffset++]);
			var pcIndex    = points[vertexOffset++];
			var pointIndex = points[vertexOffset++];
			var p = worldPoint.applyMatrix4(projectionMatrix);

			var px = Math.floor(((p.x + 1)  * ((w) / 2.0)));
			var py = Math.floor(((-p.y + 1) * ((h) / 2.0)));

			currentPoint.set(px, py);
			dists[i] = new PointInfo(queryPoint.distanceTo(currentPoint), pcIndex, pointIndex); //TODO: remove the sqrt (optimization)
		}
		dists.sort(function(a, b) { return a.distance - b.distance; });

		//selecting point in a 45px radius
		var selectedPoints = [];
		for (var i=0; i<dists.length; ++i) {
			var currentPoint = dists[i];
			if (currentPoint.distance < 45) { //TODO: use 45*45 if not using sqrt for dist
				selectedPoints.push(currentPoint);
			}
			else {
				break;
			}
		}

		//adding closest point if none were found
		if (selectedPoints.length === 0) {
			selectedPoints.push(dists[0]);
		}

		return selectedPoints;
	}

};
