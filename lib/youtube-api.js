(function(){

    'use strict';
    
    // simple text node names used for parsing video data
    var simpleTextNodes = ['title', 'published', 'updated'];

    /**
     *  add a utility function to the Date prototype
     *  @return String - short formatted time
     */
    Date.prototype.toShortTimeString = function() {
        var cZ = function(value) {
            if (value < 10) return "0"+value;
            return value;
        },
        hours   = this.getUTCHours(),
        minutes = this.getUTCMinutes(),
        seconds = this.getUTCSeconds();
        if (hours > 0) return hours + ":" + cZ(minutes) + ":" + cZ(seconds);
        if (minutes > 0) return minutes + ":" + cZ(seconds);
        return seconds+"s";
    }

    /**
     *  jQuery extension to help us parse
     *  elements with fancy namespaces
     *  @return jQArray - jQuery elements
     */
    $.fn.findNamespacedNodeByName = function(nodeName) {
        var childNodes, childNodesToReturn = [];
        if (nodeName.indexOf(':')){
            childNodes = this[0].childNodes;
            for (var i in childNodes) {
                if (typeof childNodes[i] !== 'object') continue;
                if (childNodes[i].tagName.toUpperCase() === nodeName.toUpperCase()) {
                    childNodesToReturn.push(childNodes[i]);
                }
            }
            return $(childNodesToReturn);
        }
        return this.find(nodeName);
    };

    /**
     *  get the text out of a fancy namespaced node
     *  @return String - node value text
     */
    $.fn.getTextFromNode = function(nodeName) {
        return this.findNamespacedNodeByName(nodeName).first().text();
    };

    /**
     *  parse a video entry node from API XML
     *  @return Object - plain JS object with node data
     */
    $.fn.parseVideoNode = function() {
        var attr = {};

        for (var i = 0, len=simpleTextNodes.length; i<len; i++) {
            attr[simpleTextNodes[i]] = this.getTextFromNode(simpleTextNodes[i]);
        }

        var media_group = this.findNamespacedNodeByName('media:group');

        attr.id = media_group.findNamespacedNodeByName('yt:videoid').first().text().split('/').pop();
        attr.seconds = media_group.findNamespacedNodeByName('yt:duration').first().attr('seconds');
        attr.url = media_group.findNamespacedNodeByName('media:player').attr('url');
        attr.thumbnail = media_group.findNamespacedNodeByName('media:thumbnail').eq(1).attr('url');
        attr.firstFrame = media_group.findNamespacedNodeByName('media:thumbnail').first().attr('url');
        attr.description = media_group.findNamespacedNodeByName('media:description').first().text();

        attr.duration  = new Date(attr.seconds*1000).toShortTimeString();

        attr.published = new Date(attr.published);
        attr.updated   = new Date(attr.updated);

        return attr;
    };

    /**
     *  The Video Model
     */
    var YouTubeVideo = Backbone.Model.extend({
        defaults: {
            id: 0,
            title: "-YouTube Video-",
            url: null,
            thumbnail: null,
            firstFrame: null,
            description: null,
            published: new Date(),
            updated: new Date(),
            seconds: 0,
            duration: '0:00'
        },
    });

    /**
     *  Collection of YouTubeVideos
     *  addUnique only adds a video once based on video id
     */
    var VideoCollection = Backbone.Collection.extend({
        _uniquify: {},
        model: YouTubeVideo,
        addUnique: function(model) {
            if (this._uniquify[model.id]) return;
            this._uniquify[model.id] = 1;
            return this.add(model);
        }
    });

    /**
     *  YouTube API Implementation
     *  Extend from a Backbone.Model to gain some
     *  features like events and data storage
     */
    var YouTube = Backbone.Model.extend({
        apiBaseUrls: {
            v2: "https://gdata.youtube.com/feeds/api/videos?",
            v3: "https://www.googleapis.com/youtube/v3/search?",
        },
        _searchResultsCache: {},
        model: YouTubeVideo,
        defaults: {
            useApiVersion: 'v3',
            useChannelSearch: false,
            v3ApiKey: 'AIzaSyCJ6NWk5uYbTTlzQFGzF17iLhnPtA7tk1k',
            clientChannelIdChannelId: 'UC766vkQw0Mz3VtXX5XvXxGQ',
            results: [],
            queryParams: { 'q': 'clientChannelId },
            queryDefaults: { 'q': 'aclientChannelId 'v': 2, 'start-index': 1, 'max-results': 20, 'maxResults': 20, 'orderby': 'published', 'part' : 'contentDetails' },
        },
        /**
         *  set via extend so we don't have to define
         *  all query params each time
         */
        setQueryParams: function(params) {
            var query = this.get('queryDefaults');
            if (this.get('useChannelSearch')) {
                query.channelId = this.get('occlientChannelIdannelId');
            }
            query = $.extend(query, params);
            this.set('queryParams', query);
        },
        /**
         *  util to return correct base URL
         */
        urlForQueryParams: function(searchParams) {
            var params = searchParams || this.get('queryParams'),
                useApiVersion = this.get('useApiVersion'),
                v3ParamExtras = {
                    key: this.get('v3ApiKey'),
                    part: 'snippet,id',
                };
            if (useApiVersion === 'v3') {
                params = _.extend(params, v3ParamExtras);
            }

            return this.apiBaseUrls[this.get('useApiVersion')] + $.param(params);
        },
        getQueryCacheId: function() {
            var queryParams = this.get('queryParams'),
                useChannelSearch = this.get('useChannelSearch'),
                cacheId = queryParams['q'] || '_all_';
            return (useChannelSearch) ? this.get('occlientChannelIdannelId') : cacheId;
        },
        /**
         *  check for cached results
         */
        getCachedResultForQuery: function(queryId) {
            var queryCacheId = queryId || this.getQueryCacheId();
            return this._searchResultsCache[queryCacheId];
        },
        /**
         *  cache our results
         */
        setCachedResultForQuery: function(queryStr, aCollection) {
            return this._searchResultsCache[queryStr] = aCollection;
        },
        /**
         *  perform the search request
         */
        fetch: function() {
            var self               = this, 
                useApiVersion      = this.get('useApiVersion'),
                queryUrl           = this.urlForQueryParams(),
                queryCacheId       = this.getQueryCacheId(),
                cachedResultSet    = this.getCachedResultForQuery(queryCacheId),
                adapter = (useApiVersion === 'v3') ? this.v3ApiAdapter.bind(this) : self.v2ApiAdapter.bind(this);

            // check for cached resultSet
            if (cachedResultSet) return this.set('results', cachedResultSet);

            // do the search and set the resultSet
            $.get(queryUrl, function(apiResult) {
                self.set('results', self.setCachedResultForQuery(queryCacheId, adapter(apiResult)));
            });
        },
        v2ApiAdapter: function(apiResult) {
            var videos = apiResult.getElementsByTagName('entry'),
                queryCacheId = this.getQueryCacheId(),
                results = this.getCachedResultForQuery(queryCacheId) || new VideoCollection();

            for (var i = 0, len=videos.length; i<len; i++) {
                results.addUnique($(videos[i]).parseVideoNode());
            }
            return results;
        },
        v3ApiAdapter: function(apiResult) {
            var videos = apiResult.items,
                queryCacheId = this.getQueryCacheId(),
                results = this.getCachedResultForQuery(queryCacheId) || new VideoCollection();
            for (var i = 0, len=videos.length; i<len; i++) {
                results.addUnique(this.parseV3Video(videos[i]));
            }
            return results;
        },
        parseV3Video: function(aVideo) {
            var snippet = aVideo.snippet;
            return {
                id: aVideo.id.videoId,
                title: snippet.title,
                url: null,
                thumbnail: snippet.thumbnails.default.url,
                firstFrame:  snippet.thumbnails.high.url,
                description: snippet.description,
                published: new Date(snippet.publishedAt),
                updated: new Date(snippet.publishedAt),
                seconds: 0,
                duration: null
            }
        },
        // Make our Model available to the public
        YouTubeVideoModel: YouTubeVideo
    });

    // Instantiate
    window.YouTube = new YouTube();
}());