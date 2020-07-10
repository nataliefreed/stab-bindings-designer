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

    const edgeLength = function(edge) {
        var src = edge.source().position();
        var dst = edge.target().position();
        return Math.hypot(src.x - dst.x, src.y - dst.y);
    };

    const clamp = function(x, lo, hi) {
        if(x < lo) return lo;
        if(hi < x) return hi;
        return x;
    };

/*
Lifecycle of an edge:
 * In edit mode:
   * All edges are black and straight
   * ...unless they are hovered/selected
 * In animate mode:
   * At the start:
     * Edges are top (dashed) or bottom (dotted) edges and are all 'unreachable'
   * The first node is selected:
     * The selected node is now pink
     * Edges that could be next are now highlighted in pink
     * Nodes that could be next are highlighted in yellow
   * An edge/node is hovered over
     * If reachable destination node and edge are highlighted in yellow
   * A new node is selected:
     * Edges that have been stitched are now thicker, line style/color based on top bottom

The full set of animate mode styles for edges are:
 * top+unreachable          black,  thin,  dashed
 * bottom+unreachable       black,  thin,  dotted
 * top+reachable            pink,   thin,  dashed
 * bottom+reachable         pink,   thin,  dotted
 * top+reachable+hovered    yellow, thin,  dashed
 * bottom+reachable+hovered yellow, thin,  dotted
 * top+stitched             black,  thick, solid
 * bottom+stitched          gray,   thick, solid

The full set of animate mode styles for nodes are:
 * current                  pink
 * possiblyNext             yellow
 * possiblyNext+hovered     ???
 * other                    gray

The full set of edit mode styles for edges are:
 * not-hovered: black,  thick, solid
 * hovered:     yellow, thick, solid

The full set of edit mode styles for nodes are:
 * hovered: yellow
 * other:   gray
*/
    const substyles = {
        activeColor: '#FFB300',
        hoveredColor: '#FFDB86',
        thinLineWidth: 2,
        boldLineWidth: 4,
    };

    var cy = cytoscape({
        container: $('#cy')[0],

        style: cytoscape.stylesheet()
            // This is the default for edges in edit mode
            .selector('edge[?isEditMode]')
            .css({
                'line-color': 'black',
                'line-style': 'solid',
                'width': substyles.boldLineWidth,
            })
            // In edit mode any edge can be hovered over
            .selector('edge[?isEditMode][?hovered]')
            .css({
                'line-color': substyles.hoveredColor,
            })
            // In edit mode any edge can be selected
            .selector('edge[?isEditMode]:selected')
            .css({
                'line-color': substyles.activeColor,
            })
            .selector('edge[!isEditMode]')
            .css({
                'curve-style': 'unbundled-bezier',
                'control-point-weights': [0.5],
                'control-point-distances': function(ele) {
                    // All edges in animate mode should come in opposite direction pairs
                    // We offset midpoint of each outward
                    // Set midpoint distance based on edge length, clamped to a reasonable range
                    return [clamp(edgeLength(ele)/8.,5.,12.)];
                }
            })
            .selector('edge[!isEditMode][!isVisited][!isBackStitch]')
            .css({
                'line-style': 'dashed',
                'width': substyles.thinLineWidth,
                'line-color': 'black',
            })
            .selector('edge[!isEditMode][!isVisited][?isBackStitch]')
            .css({
                'line-style': 'dotted',
                'width': substyles.thinLineWidth,
                'line-color': 'black',
            })
            .selector('edge[!isEditMode][?isVisited][!isBackStitch]')
            .css({
                'line-style': 'solid',
                'width': substyles.boldLineWidth,
                'line-color': 'black',
            })
            .selector('edge[!isEditMode][?isVisited][?isBackStitch]')
            .css({
                'line-style': 'solid',
                'width': substyles.boldLineWidth,
                'line-color': 'gray',
            })
            .selector('edge[!isEditMode][?isReachable]')
            .css({
                'line-color': substyles.activeColor,
            })
            // Mouseover, but only for unvisited nodes that might be next
            .selector('edge[!isEditMode][?hovered][!isVisited][?isReachable]')
            .css({
                'line-color': substyles.hoveredColor,
            })
            .selector('node')
            .css({
                'content': 'data(id)',
                'text-valign': 'center',
                'color': 'white',
                'background-color': '#888',
                'shape': 'circle',
                'width': 20,
                'height': 20
            })
            .selector('node:selected') //selected node in edit or animate mode
            .css({
                'background-color': '#FFB300',
                'color': 'black',
            })
            .selector('node[?hovered]') //mouseover
            .css( {
                'background-color': '#FFDB86'
            })
            .selector('node[?isCurrentVisited]')
            .css({
                'background-color': '#f43fc1'
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
        },

        // Store traversal info in the graph's data
        data: {
            nextStitchIsBackStitch: false,
            lastVisited: null,
        },
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
            data: { },
            renderedPosition: {x: x, y: y}
        });
        //console.log("added node " + node.id() + " at " + x + "," + y);
        return node;
    }

    var addEdge = function(source, target) {
        var edge = cy.add({
                group: "edges",
                data: {
                    source: source.id(),
                    target: target.id(),
                    isEditMode: editMode,
            }});
        //console.log("added edge " + edge.id());
        return edge;
    }

    var addBackStitches = function() {
        var edges = cy.edges();
        edges.forEach(function (topEdge, i, eles) {
            var parallelEdges = cy.collection([topEdge]).parallelEdges();
            if(parallelEdges.length < 2) {
                // WARNING: Rendering requires that the back stitch goes in the opposite direction as the top!
                var bottomEdge = addEdge(topEdge.target(), topEdge.source()); //add another edge between those two nodes
                bottomEdge.data('isBackStitch', true);
            }
            else {
                console.warn('Found', parallelEdges.length, 'parallel edges!');
            }
            topEdge.data('isBackStitch', false);
        });
    };

    var removeBackStitches = function() {
        var edges = cy.edges();
        edges.forEach(function (ele, i, eles) {
            if(ele.data('isBackStitch')) {
                ele.remove();
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

    var updateTotalLength = function(graph) {
        var totalEdgeLength = 0.;

        graph.edges().forEach(function( e ){
            totalEdgeLength += edgeLength(e);
        });

        var numHoleStitches = graph.edges().length;

        var displayText = $('#totalLength');

        var spine_length = $('#cy').width();
        totalEdgeLength /= spine_length;

        displayText.text('Total length of thread needed for all edges: ' + totalEdgeLength.toFixed(2) + ' * spine length + ' + numHoleStitches + ' * book thickness + a little more for needle');
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

    //is it a tree edge? (filter)
    var isTreeEdge = function(ele, j, eles) { return info(ele).isTreeEdge; };

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
                if(isTreeEdge(edge)) return;
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
        // Start by adding all nodes so that edges won't miss them
        collection.filter('node').forEach(function(ele, i, eles) {
            var added = subgraph.add( { group: ele.group(), data: { id: ele.id() }} );
            added.data('original', ele);
        });
        // Then add all edges
        collection.filter('edge').forEach(function(ele, i, eles) {
            var added = subgraph.add( { group: ele.group(), data: { id: ele.id(), source: ele.source().id(), target: ele.target().id() }} );
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

    var setAllEdgeEditMode = function(isEditMode) {
        cy.batch(function() {
            cy.edges().forEach(function(ele, i, eles) {
                ele.data("isEditMode", isEditMode);
            });
        });
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
        cy.data("nextStitchIsBackStitch", false);
        cy.data("lastVisited", null);
        setDataForEach(cy.elements(),"isVisited", false);
        setDataForEach(cy.elements(),"isReachable", false);
        setDataForEach(cy.elements(),"isBridgeEdge", false);
        setDataForEach(cy.elements(),"isCurrentVisited", false);
    };

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
        if (editMode && evt.target !== cy && (evt.target.isNode() || evt.target.isEdge())) {
            evt.target.data("hovered", true);
        }
    });

    cy.on('mouseout', function(evt) {
        if (editMode && evt.target !== cy && (evt.target.isNode() || evt.target.isEdge())) {
            evt.target.data("hovered", false);
        }
    });

    cy.on('add remove', function(evt) {
        var fullyConnected = updateConnected(cy.elements());
        updateDegree(cy.elements(), fullyConnected);
        if(editMode) {
            if (snapToGrid) {
                if(snapToGrid && evt.target !== cy && evt.target.isNode()) {
                    var closestX = calcSnapLoc(evt.target.renderedPosition().x, 24);
                    var closestY = calcSnapLoc(evt.target.renderedPosition().y, 24);
                    evt.target.renderedPosition('x', closestX);
                    evt.target.renderedPosition('y', closestY);
                }
            }
        }
        updateTotalLength(cy.elements());
    });

    var calcSnapLoc = function(val, numCols) {
        var w = $('#cy').width();
        var snapSpacing = w / numCols / 2;
        return Math.round(val/snapSpacing) * snapSpacing;
    };

    cy.on('free', function(evt) { //letting go of a dragged node
        if(snapToGrid && evt.target !== cy && evt.target.isNode()) {
            evt.target.data("hovered", false);
            var closestX = calcSnapLoc(evt.target.renderedPosition().x, 24);
            var closestY = calcSnapLoc(evt.target.renderedPosition().y, 24);
            evt.target.renderedPosition('x', closestX);
            evt.target.renderedPosition('y', closestY);
        }

        //don't allow nodes to go off-screen
        if(evt.target.renderedPosition().x < 0) {
            evt.target.renderedPosition('x', 0);
        }
        if(evt.target.renderedPosition().x > $('#cy').width()) {
            evt.target.renderedPosition('x', $('#cy').width());
        }
        if(evt.target.renderedPosition().y < 0) {
            evt.target.renderedPosition('y', 0);
        }
        if(evt.target.renderedPosition().y > $('#cy').height()) {
            evt.target.renderedPosition('y', $('#cy').height());
        }

        updateTotalLength(cy.elements());
    });


    //fixes bug where cytoscape doesn't update position when scroll event happens outside of its div
    $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
        var target = $(e.target).attr("href") // activated tab
        if(target == "#home") {
            cy.resize();
        }
    });

    //

    cy.on('tapstart', function(evt) {
        if (evt.target === cy) { //clicked on background
            //console.log("clicked on background");
            if(editMode) { // in edit mode add a node
                var selected = cy.$(':selected');
                //console.log(selected);
                if (selected.length > 0) {
                    unselectAll();
                    //console.log("unselecting");
                }
                else {
                    //renderedPosition: { x: evt.originalEvent.x - $('#cy').offset().left, y: evt.originalEvent.y - $('#cy').offset().top }
                    addNode(evt.renderedPosition.x, evt.renderedPosition.y);
                }
            }
        }
        else { //if not on background
            //edit mode, adding nodes
            //console.log( 'clicked ' + evt.target.id() + " " + evt.target.renderedPosition.x + "," +  evt.target.renderedPosition.y);
            if (editMode && evt.target.isNode()) {
                var selected = cy.$(':selected');
                //console.log(selected[0].id() + " is selected");

                //don't allow loops or parallel edges
                if (selected.length > 0 && selected[0].isNode() && selected[0] != evt.target) {
                    if (selected[0].edgesWith(evt.target).length < 1) { //if not already connected by an edge (no parallel edges allowed)
                        addEdge(selected[0], evt.target).data("isVisited", true);
                        //unselectAll(); //not working, probably bc select event happens after tap
                    }
                }
            }
            //animate mode
            else if (!editMode && evt.target.isNode()) {
                var lastVisited = cy.data('lastVisited');
                if (lastVisited != null) { //if we've already started
                    var edgesBetween = findEdgesBetween(lastVisited, evt.target).filter('[!isVisited][?isReachable]');
                    if (edgesBetween.length > 0) {
                        lastVisited.data("isCurrentVisited", false); //no longer the current visited (for styling)
                        edgesBetween[0].data("isVisited", true);
                        evt.target.data("isVisited", true);
                        cy.data('lastVisited', evt.target);
                        evt.target.data("isCurrentVisited", true); //mark the current one (for styling)
                        // Mark that we will switch to back/front stitches
                        cy.data('nextStitchIsBackStitch', !cy.data('nextStitchIsBackStitch'));
                    }
                }
                else { //first one clicked
                    evt.target.data("isVisited", true);
                    cy.data('lastVisited', evt.target);
                    evt.target.data("isCurrentVisited", true); //mark the current one (for styling)
                }

                cy.elements().data("isReachable", false);
                var reachable = getReachableNodesFrom(cy.elements(), cy.data('lastVisited'));
                reachable.data("isReachable", true);
            }
        }});

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
            var candidates;
            if(notBridges.length != 0) { //if we have some non-bridges
                var nodesConnectedToNotBridges = notBridges.connectedNodes().filter('[!isVisited]').difference(node);
                candidates = notBridges.union(nodesConnectedToNotBridges);
            }
            else {
                candidates = adjacent;
            }
            const nextStitchIsBackStitch = cy.data("nextStitchIsBackStitch");
            return candidates.filter(function(ele, i, eles) {
                        return ele.data("isBackStitch") == nextStitchIsBackStitch;
            });
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
        //console.log("download");
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
        if($('#snapToGrid').is(":checked")) {
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
            $('#totalLength').show(); // Only show in animate mode because value in edit mode doesn't reflect needed amount of string
            unselectAll();
            cy.autolock(true);
            cy.autounselectify(true);
            resetCircuit();
            addBackStitches();
            updateBridges();
            setAllEdgeEditMode(false);
            //hideDegree();
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
            $('#totalLength').hide();
            cy.autolock(false);
            cy.autounselectify(false);
            resetCircuit();
            removeBackStitches();
            setDataForEach(cy.elements(),"isVisited", true);
            setAllEdgeEditMode(true);
        }
        this.blur(); //this is not so good for accessibility so change it! leaving for now because need focus on cy canvas
    });

    //Do stuff at start

    var x_spacing = $('#cy').width() / 6;
    var y_spacing = $('#cy').height() / 2.5;
    var leftOffset = $('#cy').offset().left;
    var topOffset = $('#cy').offset().top;

    var numInnerHoles = 4;

    var initNodes = [];
    var pushNode = function(x, y) {
        initNodes.push(addNode(x, y));
    }
    for(var i=0;i<numInnerHoles;i++)
    {
        pushNode(x_spacing*i*2, y_spacing);
        if(i===0 || i === numInnerHoles-1) {
            pushNode(x_spacing*i*2, y_spacing*2);
        }
        else {
            pushNode(x_spacing*i*2, $('#cy').height());
        }
    }

    for(var i=0;i<numInnerHoles-1;i++)
    {
        pushNode(x_spacing*i*2+x_spacing, y_spacing*2);
        pushNode(x_spacing*i*2+x_spacing, $('#cy').height());
    }

    //across the top and long verticals
    addEdge(initNodes[0], initNodes[2]);
    addEdge(initNodes[2], initNodes[3]);
    addEdge(initNodes[2], initNodes[4]);
    addEdge(initNodes[4], initNodes[5]);
    addEdge(initNodes[4], initNodes[6]);
    //addEdgeByID('n6','n7');
    //addEdgeByID('n6','n8');
    //addEdgeByID('n8','n9');
    //addEdgeByID('n8','n10');

    //diagonals (small book)
    addEdge(initNodes[2], initNodes[10]);
    addEdge(initNodes[10], initNodes[4]);
    addEdge(initNodes[2], initNodes[8]);
    addEdge(initNodes[4], initNodes[12]);

    //small verticals (small book)
    addEdge(initNodes[8], initNodes[9]);
    addEdge(initNodes[12], initNodes[13]);
    addEdge(initNodes[10], initNodes[11]);

    //small horizontals (small book)
    addEdge(initNodes[1], initNodes[8]);
    addEdge(initNodes[12], initNodes[7]);

    //diagonals
    //addEdge(initNodes[2], initNodes[12]);
    //addEdge(initNodes[2], initNodes[14]);
    //addEdge(initNodes[4], initNodes[14]);
    //addEdge(initNodes[4], initNodes[16]);
    //addEdge(initNodes[6], initNodes[16]);
    //addEdge(initNodes[6], initNodes[18]);
    //addEdge(initNodes[8], initNodes[18]);
    //addEdge(initNodes[8], initNodes[20]);
    //
    ////small verticals and 2 small horizontals at edge
    //addEdge(initNodes[12], initNodes[13]);
    //addEdge(initNodes[14], initNodes[15]);
    //addEdge(initNodes[16], initNodes[17]);
    //addEdge(initNodes[18], initNodes[19]);
    //addEdge(initNodes[20], initNodes[21]);
    //
    //addEdge(initNodes[12], initNodes[1]);
    //addEdge(initNodes[20], initNodes[11]);

    var fullyConnected = updateConnected(cy.elements());
    updateDegree(cy.elements(), fullyConnected);

    drawGrid(24); //numCols, 6" with 1/4" spacing

}); // on dom ready