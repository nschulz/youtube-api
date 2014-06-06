youtube-api
===========

YouTube API examples

#Standard View (For all browsers)
http://demos.nateschulz.com/youtube/v2.html#q=apple
http://demos.nateschulz.com/youtube/v2.html#q=apple&apiVersion=v3

#Enhanced View (For webkit browsers-only - Safari preferred)
http://demos.nateschulz.com/youtube/v3.html#q=apple
http://demos.nateschulz.com/youtube/v3.html#q=apple&apiVersion=v2

The standard application view defaults to Google’s Feed API v2. The Enhanced View defaults to Google’s JSON API v3. Either can be overwritten to use the api of your choice by appending apiVersion=v2 or v3 to the URL. You’ll be able to tell v2 vs v3 because the preview image I use is much smaller in the v2 api. Both use the same “YouTube” API object, written by me and whose implementation can be found in youtube-api.js.

#Known Issues
* Chrome fails to render the background gradient