$(function(){ // on dom ready

    $('.file-inputs').bootstrapFileInput();
    $('input[type=file]').bootstrapFileInput();

    var editMode = true;

    var undoStack = new Array();

    var snapToGrid = true;

    $('#resetButton').hide();

    $(window).bind('beforeunload', function () {
        return 'Your design is not saved!';
    });

    $("#book-width").val($('#cy').width()/96);
    $("#book-height").val($('#cy').height()/96);

    $("#book-width").change(function() {
        $(this).val(setBookWidthInInches($(this).val()));
    });

    $("#book-height").change(function() {
        $(this).val(setBookHeightInInches($(this).val()));
    });

    var cy = cytoscape({
        container: $('#cy')[0],

        style: cytoscape.stylesheet()
            .selector('node')
            .css({
                'content': 'data(name)',
                'text-valign': 'center',
                'color': 'white',
                'background-color': '#888',
                'shape': 'circle',
                'width': 20,
                'height': 20
            })
            .selector('edge')
            .css({
                'curve-style': 'bezier',
                'control-point-step-size':  12
            })
            .selector('node:selected') //selected node in edit mode
            .css({
                'background-color': '#FFB300',
                'color': 'black',
            })
            .selector('edge[!isBridgeEdge]') //non-bridge edges in animate mode
            .css( {
                'width': 1,
                'line-color': '#000000',
            })
            .selector('[?isBridgeEdge]')
            .css({
                'width': 1,
                'line-color': '#000000',
                'line-style': "dashed"
            })
            .selector('edge:selected')
            .css({
                'line-color': '#FFB300',
                'width': 4
            })
            .selector('edge[?isVisited]')
            .css({
                //'line-color': '#B200B2',
                //'background-color': '#B200B2'
                //'line-style': "dashed",
                'width': 5
            })
            .selector('[?isReachable]')
            .css({
                'line-color': '#FF8100'
                //'background-color': '#66FF33'
            })
            .selector('node[?isCurrentVisited]')
            .css({
                'background-color': '#FF8100'
            })
            .selector('edge[?inEditMode]') //edges in edit mode
            .css( {
                'width': 4
            })
            //.selector('node[!inEditMode]') //edges in edit mode
            //.css( {
            //    'color': '#888'
            //})
            .selector('node[?hovered]') //mouseover
            .css( {
                'background-color': '#FFDB86'
            })
            .selector('edge[?hovered]') //mouseover
            .css( {
                'line-color': '#FFDB86'
            }),

        zoomingEnabled: false,
        userZoomingEnabled: false,
        panningEnabled: false,
        userPanningEnabled: false,
        boxSelectionEnabled: false,
        selectionType: 'single',

        elements: {
            nodes: [ ],
            edges: [ ]
        },

        layout: {
            name: 'preset',
            padding: 10
        }
    });

    var setBookWidthInInches = function(w) {
        if(w < 0) {
            w = 0;
        } else if(w > 10) {
            w = 10;
        }
        $('#cy').width(w+"in");
        return w;
    }

    var setBookHeightInInches = function(h) {
        if(h < 0) {
            h = 0;
        } else if(h > 3) {
            h = 3;
        }
        $('#cy').height(h+"in");
        return h;
    }

    var addNode = function(x, y) {
        var node = cy.add({
            group: "nodes",
            data: {},
            renderedPosition: {x: x, y: y}
        });
        //console.log("added node " + node.id() + " at " + x + "," + y);
        return node;
    }

    var addEdge = function(source, target) {
        var edge = cy.add({group: "edges", data: {source: source.id(), target: target.id()}});
        //console.log("added edge " + edge.id());
        return edge;
    }

    var addEdgeByID = function(source, target) {
        var edge = cy.add({group: "edges", data: {source: source, target: target}});
        //console.log("added edge " + edge.id());
        return edge;
    }


    var addBackStitches = function() {
        var edges = cy.edges();
        edges.forEach(function (ele, i, eles) {
            var parallelEdges = cy.collection([ele]).parallelEdges();
            if (parallelEdges.length < 2) {
                addEdge(ele.source(), ele.target()); //add another edge between those two nodes
            }
        });
    };

    var removeBackStitches = function() {
        var edges = cy.edges();
        edges.forEach(function (ele, i, eles) {
            var parallelEdges = cy.collection([ ele ]).parallelEdges();
            for(var i=0;i<parallelEdges.length-1;i++) {
                parallelEdges[i].remove();
            }
        });
    };



    //check if graph is fully connected
    var updateConnected = function(graph) {
        var displayText = $('#connectedStatus');

        var numComponents = getNumComponents(graph);
        //console.log("number of components: " + numComponents);

        if(numComponents <= 1) {
            displayText.text("1 fully connected graph");
            return true;
        } else {
            displayText.text(numComponents + " disconnected subgraphs");
            return false;
        }
        /*
        if(numComponents <= 1) {
            displayText.text("fully connected");
            displayText.removeClass("text-danger");
            displayText.addClass("text-success");
            return true;
        }
        else {
            displayText.text("not fully connected");
            displayText.addClass("text-danger");
            displayText.removeClass("text-success");
            return false;
        }*/
    }

    var updateDegree = function(graph, fullyConnected) {
        var displayText = $('#circuitStatus');
        var degreeText = $('#degreeInfo');
        var numOddVertices = 0;

        graph.nodes().forEach(function( ele ){
            var degree = ele.degree(false);
            if(degree % 2 !== 0) {
                numOddVertices++;
            }
            if(editMode) {
                ele.css({content: degree});
            }
        });

        degreeText.text("number of vertices of odd degree (with an odd number of stitch connections): " + numOddVertices);

        if(numOddVertices === 0 && fullyConnected && graph.nodes().length > 0) {
            displayText.text("Euler circuit! Start stitching from any hole");
            //displayText.removeClass("text-danger");
            //displayText.removeClass("text-warning");
            //displayText.addClass("text-success");
            return true;
        }
        else if(numOddVertices == 2 && fullyConnected) {
            displayText.text("Euler path (start and end stitches in different holes)");
            //displayText.removeClass("text-danger");
            //displayText.removeClass("text-success");
            //displayText.addClass("text-warning");
            return true;
        }
        else {
            displayText.text("no Euler path or circuit");
            //displayText.addClass("text-danger");
            //displayText.removeClass("text-warning");
            //displayText.removeClass("text-success");
            return false;
        }

    }

    var unselectAll = function() {
        var selected = cy.$(':selected');
        //console.log(selected.length);
        for(var i=0;i<selected.length;i++) {
            selected[i].unselect();
            //console.log(selected[i].id() + " deselected");
        }
    };

    var deleteSelected = function() {
        var selected = cy.$(':selected');
        if(selected.length > 0) {
            undoStack.push(cy.remove(selected[0].union(selected[0].connectedEdges())));
        }
    };

    var clearAll = function() {
        var collection = cy.elements();
        undoStack.push(cy.remove(collection));
    };

    var downloadDataUri = function(options) {
        if (!options.url)
            options.url = "https://download-data-uri.appspot.com/";
        $('<form method="post" action="' + options.url
        + '" style="display:none"><input type="hidden" name="filename" value="'
        + options.filename + '"/><input type="hidden" name="data" value="'
        + options.data + '"/></form>').appendTo('body').submit().remove();
    }

    //Bridge finding
    var scratchNamespace = "_bridgeFinding";

    //initialize some scratch space
    var initInfo = function(eles) {
        eles.forEach(function(ele) {
            ele.scratch(scratchNamespace,{});
        });
    };

    //remove the scratch space
    var removeInfo = function(eles) {
        eles.forEach(function(ele) { ele.removeScratch(scratchNamespace); });
    };

    //get the scratch info
    var info = function(ele) {
        return ele.scratch(scratchNamespace);
    };

    //set an info field on each
    var setInfoForEach = function(eles,key,value) {
        eles.forEach(function(ele) { info(ele)[key] = value; });
    };

    //set a data field on each
    var setDataForEach = function(eles,key,value) {
        eles.forEach(function(ele) { ele.data(key,value); });
    };

    //print some debug info for graph?
    var debugEles = function(eles) {
        console.log("Elements:");
        for(var i = 0; i < eles.length; i++) {
            var e = eles[i];
            if(e.isEdge()) console.log(e.id()+": "+e.source().id()+"->"+e.target().id());
            if(e.isNode()) console.log(e.id());
        }
    };
    var eleStr = function(e) {
        if(e.isEdge()) return (e.id()+"("+e.source().id()+"->"+e.target().id()+")");
        if(e.isNode()) return (e.id());
    };
    var elesStr = function(eles) {
        var result = "[";
        for(var i = 0; i < eles.length; i++) {
            if(i !== 0) result += ", ";
            result += eleStr(eles[i]);
        }
        result += "]";
        return result;
    };

    //to use as filter
    //is it a node?
    var isNode = function(i, ele) { return ele.isNode(); };

    //is it a tree edge? (filter)
    var isTreeEdge = function(j,ele) { return info(ele).isTreeEdge; };

    var treeNeighbors = function(node) {
        var nodes = [];
        node.connectedEdges(isTreeEdge).forEach(function(edge) {
            if(edge.source() != node) nodes.push(edge.source());
            if(edge.target() != node) nodes.push(edge.target());
        });
        return nodes;
    };
    var setPreorders = function(tree) {
        var setNodePreorder = function(node, next) {
            var ni = info(node);
            if("preorder" in ni) return;
            ni.preorder = next++;
            treeNeighbors(node).forEach(function(child) {
                next = setNodePreorder(child, next);
            });
            return next;
        };
        tree.nodes().forEach(function(root) { setNodePreorder(root, 1); });
    };
    var setPostorders = function(tree) { //
        var roots = [];
        var setNodePostorder = function(node, next) {
            var ni = info(node);
            if("postorder" in ni) return next;
            ni.postorder = null;
            treeNeighbors(node).forEach(function(node) {
                next = setNodePostorder(node, next);
            });
            ni.postorder = next++;
            return next;
        };
        tree.nodes().forEach(function(seed) {
            if(!("postorder" in info(seed)))
                roots.push(seed);
            setNodePostorder(seed,1);
        });
        return roots;
    };
    var orientEdges = function(graph) {
        graph.edges().forEach(function(edge) {
            var source = edge.source();
            var target = edge.target();
            var ei = info(edge);
            if(info(source).postorder > info(target).postorder) {
                ei.parent = source;
                ei.child = target;
            }
            else {
                ei.parent = target;
                ei.child = source;
            }
        });
    };
    var treeChildren = function(node) {
        var children = [];
        var parentPostorder = info(node).postorder;
        node.connectedEdges(isTreeEdge).forEach(function(edge) {
            var ei = info(edge);
            if(ei.child != node)
                children.push(ei.child);
        });
        return children;
    };
    var treeParent = function(node) {
        var parent;
        var childPostorder = info(node).postorder;
        node.connectedEdges(isTreeEdge).forEach(function(edge) {
            var ei = info(edge);
            if(ei.parent != node) {
                parent = ei.parent;
                return false;
            }
        });
        return parent;
    };

    // Call visitor(node,children) on each node after calling visitor on all children
    var postorderApply = function(roots,visitor) {
        var applyVisitor = function(node) {
            var children = treeChildren(node);
            children.forEach(applyVisitor);
            visitor(node, children);
        };
        roots.forEach(applyVisitor);
    };
    // Call visitor(node,parent) on each node after calling visitor on parent
    var preorderApply = function(roots,visitor) {
        var applyVisitor = function(node) {
            var parent = treeParent(node);
            visitor(node,parent);
            var children = treeChildren(node);
            children.forEach(function(child) { applyVisitor(child, node); });
        };
        roots.forEach(applyVisitor);
    };
    var setNumDescendents = function(roots) {
        var setNodeNumDescendents = function(node, children) {
            var nodeInfo = info(node);
            if("numDescendents" in nodeInfo) {
                //console.log("Visitor applied multiple times!!!");
                return 1;
            }
            var totalNd = 1;
            children.forEach(function(child) { totalNd += info(child).numDescendents; });
            nodeInfo.numDescendents = totalNd;
        };
        postorderApply(roots,setNodeNumDescendents);
    };
    var setLabelRange = function(roots) {
        postorderApply(roots,function(node,children) {
            var ni = info(node);
            ni.L = ni.postorder;
            ni.H = ni.postorder;
            children.forEach(function(child) {
                var ci = info(child);
                if(ci.L < ni.L) ni.L = ci.L;
                if(ci.H > ni.H) ni.H = ci.H;
            });
            node.connectedEdges().forEach(function(edge) {
                if(isTreeEdge(-1,edge)) return;
                var neighbor;
                if(edge.source() == node) neighbor = edge.target();
                if(edge.target() == node) neighbor = edge.source();
                var po = info(neighbor).postorder;
                if(po < ni.L) ni.L = po;
                if(po > ni.H) ni.H = po;
            });
        });
    };

    var setBridges = function(graph) {
        initInfo(graph);
        var tree = graph.kruskal();
        setInfoForEach(cy.elements(),"isTreeEdge",false);
        setInfoForEach(tree.edges(),"isTreeEdge",true);
        var roots = setPostorders(tree);
        orientEdges(graph);
        setNumDescendents(roots);
        setLabelRange(roots);
        setDataForEach(graph.edges(),"isBridgeEdge",false); // default to false
        tree.edges().forEach(function(edge) {
            var di = info(info(edge).child);
            var po = di.postorder;
            var nd = di.numDescendents;
            var L = di.L;
            var H = di.H;
            if(H <= po && L > (po - nd)) {
                edge.data("isBridgeEdge",true);
            }
        });
        removeInfo(graph);

        return roots; //this doesn't really make sense to return here
    };
    //creates subgraph from a collection with identical topology storing references to original nodes/edges for future updates / merges
    //assumes all nodes referenced by edges in the collection are included
    var properSubgraph = function(collection) {
        var subgraph = cytoscape({ headless: true });
        collection.forEach(function(ele, i, eles) {
            var added;
            if(ele.isEdge()) {
                added = subgraph.add( { group: ele.group(), data: { id: ele.id(), source: ele.source().id(), target: ele.target().id() }} );
            } else {
                added = subgraph.add( { group: ele.group(), data: { id: ele.id() }} );
            }
            added.data('original', ele);
        });
        return subgraph;
    }

    //filters (this could be generalized...)
    var isBridgeEdge = function(i,edge) { return edge.data("isBridgeEdge"); };
    var isVisited = function(i,ele) { return ele.data("isVisited"); };
    var isReachable = function(i,ele) { return ele.data("isReachable"); };

    var updateBridges = function() {
        //var graph = cy.elements();
        var available = properSubgraph(cy.elements().filter('node, edge[!isVisited]'));
        setBridges(available.elements());
        cy.elements().forEach(function(ele, i, eles) { //start fresh and treat visited edges as non-bridges
            ele.data('isBridgeEdge', false);
        });
        available.elements().forEach(function(ele, i, eles) { //copy data from cloned subgraph
            ele.data('original').data('isBridgeEdge', ele.data('isBridgeEdge'));
        });
//    graph.edges().forEach(function(edge) {
//      console.log(eleStr(edge)+" isBridgeEdge="+edge.data("isBridgeEdge"));
//    });
    }

    function getNumComponents(graph) {
        initInfo(graph);
        var tree = graph.kruskal();
        setInfoForEach(graph.edges(),"isTreeEdge",false);
        setInfoForEach(tree.edges(),"isTreeEdge",true);
        var roots = setPostorders(tree);
        return roots.length;
    }

    //Events

    var resetCircuit = function() {
        circuit = cy.collection(); //starts out empty
        setDataForEach(cy.elements(),"isVisited", false);
        setDataForEach(cy.elements(),"isReachable", false);
        setDataForEach(cy.elements(),"isBridgeEdge", false);
        setDataForEach(cy.elements(),"isCurrentVisited", false);
        lastVisited = null;
    };

    var circuit;
    var lastVisited;
    resetCircuit();

    var drawGrid = function(numCols) {
        var c = $('#grid-canvas');
        var ctx = c[0].getContext("2d");

        var w = $('#cy').width();
        var h = $('#cy').height();
        var spacing = w / numCols;

        ctx.strokeStyle="#98D0E1";
        ctx.beginPath();
        ctx.imageSmoothingEnabled = true;
        for(var row=0;row<w/spacing+1;row++) {
            ctx.moveTo(0, spacing*row);
            ctx.lineTo(w, spacing*row);
        }
        for(var col=0;col<numCols+1;col++) {
            ctx.moveTo(spacing*col, 0);
            ctx.lineTo(spacing*col, h);
        }
        ctx.stroke();

        //border
        ctx.strokeStyle = "#438CA1";
        ctx.strokeRect(0,0,w-1,h-1);

        ////borders
        //ctx.beginPath();
        //ctx.strokeStyle="#438CA1";
        //ctx.moveTo(0, 0);
        //ctx.lineTo(w, 0);
        //ctx.moveTo(0, 0);
        //ctx.lineTo(0, h);
        //
        //ctx.moveTo(w, 0);
        //ctx.lineTo(w, h);
        //ctx.moveTo(0, h);
        //ctx.lineTo(w, h);
        //
        //ctx.stroke();

        setDataForEach(cy.elements(),"isVisited", true);
    }

    cy.on('mouseover', function(evt) {
        if (editMode && evt.cyTarget !== cy && (evt.cyTarget.isNode() || evt.cyTarget.isEdge())) {
            evt.cyTarget.data("hovered", true);
        }
    });

    cy.on('mouseout', function(evt) {
        if (editMode && evt.cyTarget !== cy && (evt.cyTarget.isNode() || evt.cyTarget.isEdge())) {
            evt.cyTarget.data("hovered", false);
        }
    });

    cy.on('add remove', function(evt) {
        var fullyConnected = updateConnected(cy.elements());
        updateDegree(cy.elements(), fullyConnected);
        if(editMode) {
            if (snapToGrid) {
                if(snapToGrid && evt.cyTarget.isNode()) {
                    var closestX = calcSnapLoc(evt.cyTarget.renderedPosition().x, 24);
                    var closestY = calcSnapLoc(evt.cyTarget.renderedPosition().y, 24);
                    evt.cyTarget.renderedPosition('x', closestX);
                    evt.cyTarget.renderedPosition('y', closestY);
                }
            }
        }
    });

    var calcSnapLoc = function(val, numCols) {
        var w = $('#cy').width();
        var snapSpacing = w / numCols / 2;
        return Math.round(val/snapSpacing) * snapSpacing;
    };

    cy.on('free', function(evt) { //letting go of a dragged node
        if(snapToGrid && evt.cyTarget.isNode()) {
            evt.cyTarget.data("hovered", false);
            var closestX = calcSnapLoc(evt.cyTarget.renderedPosition().x, 24);
            var closestY = calcSnapLoc(evt.cyTarget.renderedPosition().y, 24);
            evt.cyTarget.renderedPosition('x', closestX);
            evt.cyTarget.renderedPosition('y', closestY);
        }
    });

    cy.on('tapstart', function(evt) {
        if (evt.cyTarget === cy && editMode) { //clicked on background, add a node
            //console.log("clicked on background");
                var selected = cy.$(':selected');
                console.log(selected);
                if (selected.length > 0) {
                    unselectAll();
                    console.log("unselecting");
                }
                else {
                    //renderedPosition: { x: evt.originalEvent.x - $('#cy').offset().left, y: evt.originalEvent.y - $('#cy').offset().top }
                    addNode(evt.cyRenderedPosition.x, evt.cyRenderedPosition.y);
                }
            }
            else { //if not on background
                //edit mode, adding nodes
                //console.log( 'clicked ' + evt.cyTarget.id() + " " + evt.cyTarget.renderedPosition.x + "," +  evt.cyTarget.renderedPosition.y);
                if (editMode && evt.cyTarget.isNode()) {
                    var selected = cy.$(':selected');
                    //console.log(selected[0].id() + " is selected");

                    //don't allow loops or parallel edges
                    if (selected.length > 0 && selected[0].isNode() && selected[0] != evt.cyTarget) {
                        if (selected[0].edgesWith(evt.cyTarget).length < 1) { //if not already connected by an edge (no parallel edges allowed)
                            addEdge(selected[0], evt.cyTarget).data("isVisited", true);
                            //unselectAll(); //not working, probably bc select event happens after tap
                        }
                    }
                }
                //animate mode
                else if (!editMode && evt.cyTarget.isNode()) {

                    if (lastVisited != null) { //if we've already started
                        var edgesBetween = findEdgesBetween(lastVisited, evt.cyTarget).filter('[!isVisited][?isReachable]');
                        if (edgesBetween.length > 0) {
                            lastVisited.data("isCurrentVisited", false); //no longer the current visited (for styling)
                            edgesBetween[0].data("isVisited", true);
                            evt.cyTarget.data("isVisited", true);
                            lastVisited = evt.cyTarget;
                            lastVisited.data("isCurrentVisited", true); //mark the current one (for styling)
                        }
                    }
                    else { //first one clicked
                        evt.cyTarget.data("isVisited", true);
                        lastVisited = evt.cyTarget;
                        lastVisited.data("isCurrentVisited", true); //mark the current one (for styling)
                    }

                    cy.elements().data("isReachable", false);
                    var reachable = getReachableNodesFrom(cy.elements(), lastVisited);
                    reachable.data("isReachable", true);

                }
            }
        });

    var findEdgesBetween = function(node1, node2) {
        return node1.edgesWith(node2);
    }

    var getReachableNodesFrom = function(graph, node) {
        var available = graph.filter('[!isVisited]');
        if(node == null) {
            return available;
        }
        else {
            updateBridges();
            var adjacent = node.closedNeighborhood().filter('[!isVisited]'); //nodes and edges adjacent to me not yet visited
            var adjacentEdges = adjacent.filter('edge'); //edges adjacent to me not yet visited
            var notBridges = adjacentEdges.filter('[!isBridgeEdge]'); //edges adjacent to me not yet visited that are not bridges
            if(notBridges.length != 0) { //if we have some non-bridges
                var nodesConnectedToNotBridges = notBridges.connectedNodes().filter('[!isVisited]').difference(node);
                return notBridges.union(nodesConnectedToNotBridges);
            }
            else {
                return adjacent;
            }
        }
    };

    $(document).keydown(function(e) {
        //console.log("key: " + e.keyCode);
        if(editMode) {
            if (e.keyCode === 46 || e.keyCode === 8) { //delete or backspace
                e.preventDefault();
                deleteSelected();
            }
            else if (e.keyCode === 32) { //spacebar
                e.preventDefault();
                unselectAll();
            }
        }
    });


    $('#downloadButton').click( function() {
        console.log("download");
        var png = cy.png({bg:'#eeeeee'});
        window.open().location = png;
        this.blur();
    });

    $('#saveButton').click( function() {
        var save = document.createElement('a');
        save.download = "graph.json";
        //console.log(cy.elements().jsons());
        save.href = 'data:text/json;charset=utf8,' + encodeURIComponent(JSON.stringify(cy.elements().jsons()));
        save.click();
    });

    $('#loadButton').click( function(evt) {
        var files = evt.target.files; // FileList object

        //// files is a FileList of File objects. List some properties.
        //var output = [];
        //for (var i = 0, f; f = files[i]; i++) {
        //    output.push('<li><strong>', escape(f.name), '</strong> (', f.type || 'n/a', ') - ',
        //        f.size, ' bytes, last modified: ',
        //        f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
        //        '</li>');
        //}
        //console.log(output);
    });

    $('#deleteButton').click( function() {
        deleteSelected();
        this.blur();
    });

    $('#clearAllButton').click( function() {
        if(confirm("Are you sure?")) {
            clearAll();
        }
        this.blur();
    });

    $('#undoButton').click( function() {
        undoStack.pop().restore();
        this.blur();
    });

    $('#resetButton').click( function() {
        resetCircuit();
        updateBridges();
    });

    $('#snapToGrid').change(function () {
        if($('#snapToGrid').prop("checked")) {
            snapToGrid = true;
        }
        else {
            snapToGrid = false;
        }
    });

    $('#toggleModeButton').click( function() {
        var text = $('#toggleModeButton').text();
        if(text === "Switch to Animate Mode") { //go to animate mode
            editMode = false;
            $('#deleteButton').hide();
            $('#clearAllButton').hide();
            $('#resetButton').show();
            $('#backStitchButton').hide();
            $('#undoButton').hide();
            //$('#saveButton').hide();
            $('#drawing-instructions').hide();
            $('#toggleModeButton').text("Switch to Edit Mode");
            unselectAll();
            cy.autolock(true);
            cy.autounselectify(true);
            resetCircuit();
            addBackStitches();
            updateBridges();
            hideDegree();
            this.blur();
        }
        else { //go to edit mode
            editMode = true;
            $('#deleteButton').show();
            $('#clearAllButton').show();
            $('#resetButton').hide();
            $('#backStitchButton').show();
            $('#undoButton').show();
            //$('#saveButton').show();
            $('#drawing-instructions').show();
            $('#toggleModeButton').text("Switch to Animate Mode");
            cy.autolock(false);
            cy.autounselectify(false);
            resetCircuit();
            removeBackStitches();
            setDataForEach(cy.elements(),"isVisited", true);
        }
        this.blur(); //this is not so good for accessibility so change it! leaving for now because need focus on cy canvas
    });

    //Do stuff at start

    var x_spacing = $('#cy').width() / 6;
    var y_spacing = $('#cy').height() / 2.5;
    var leftOffset = $('#cy').offset().left;
    var topOffset = $('#cy').offset().top;

    var numInnerHoles = 4;
    for(var i=0;i<numInnerHoles;i++)
    {
        addNode(x_spacing*i*2, y_spacing);
        if(i===0 || i === numInnerHoles-1) {
            addNode(x_spacing*i*2, y_spacing*2);
        }
        else {
            addNode(x_spacing*i*2, $('#cy').height());
        }
    }

    for(var i=0;i<numInnerHoles-1;i++)
    {
        addNode(x_spacing*i*2+x_spacing, y_spacing*2);
        addNode(x_spacing*i*2+x_spacing, $('#cy').height());
    }

    //across the top and long verticals
    addEdgeByID('n0','n2');
    addEdgeByID('n2','n3');
    addEdgeByID('n2','n4');
    addEdgeByID('n4','n5');
    addEdgeByID('n4','n6');
    //addEdgeByID('n6','n7');
    //addEdgeByID('n6','n8');
    //addEdgeByID('n8','n9');
    //addEdgeByID('n8','n10');

    //diagonals (small book)
    addEdgeByID('n2','n10');
    addEdgeByID('n10','n4');
    addEdgeByID('n2','n8');
    addEdgeByID('n4','n12');

    //small verticals (small book)
    addEdgeByID('n8','n9');
    addEdgeByID('n12','n13');
    addEdgeByID('n10','n11');

    //small horizontals (small book)
    addEdgeByID('n1','n8');
    addEdgeByID('n12','n7');

    //diagonals
    //addEdgeByID('n2','n12');
    //addEdgeByID('n2','n14');
    //addEdgeByID('n4','n14');
    //addEdgeByID('n4','n16');
    //addEdgeByID('n6','n16');
    //addEdgeByID('n6','n18');
    //addEdgeByID('n8','n18');
    //addEdgeByID('n8','n20');
    //
    ////small verticals and 2 small horizontals at edge
    //addEdgeByID('n12','n13');
    //addEdgeByID('n14','n15');
    //addEdgeByID('n16','n17');
    //addEdgeByID('n18','n19');
    //addEdgeByID('n20','n21');
    //
    //addEdgeByID('n12','n1');
    //addEdgeByID('n20','n11');

    var fullyConnected = updateConnected(cy.elements());
    updateDegree(cy.elements(), fullyConnected);

    drawGrid(24); //numCols, 6" with 1/4" spacing

}); // on dom ready