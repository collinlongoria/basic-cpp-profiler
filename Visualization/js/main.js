//GLOBAL STUFF //////////////////////////////////
const tooltip = d3.select("#tooltip");
/////////////////////////////////////////////////

//TREE GRAPH ////////////////////////////////////
const svg1 = d3.select("#tree");
const baseWidth = 800;
const baseHeight = 400;

// Read and build the graph
d3.json("data/profile_output.json").then(raw => {
  const roots = findRootFunctions(raw);
  const treeData = buildInitialTree(raw, roots);
  renderTree(treeData, raw.callGraph);
}).catch(console.error);

// Determine true roots: in 'functions' but never a child
function findRootFunctions(data) {
  const allFuncs = new Set(Object.keys(data.functions));
  const calledFuncs = new Set();
  Object.values(data.callGraph).forEach(children =>
    Object.keys(children).forEach(name => calledFuncs.add(name))
  );
  return [...allFuncs].filter(f => !calledFuncs.has(f));
}

// Build tree with function call counts
function buildInitialTree(raw, roots) {
  return {
    name: "Application",
    children: roots.map(func => ({
      name: `${func} (${raw.functions[func]?.callCount ?? 0})`,
      _rawName: func,
      _expanded: false,
      children: []
    }))
  };
}

// Expand a node (lazy loading from callGraph)
function expandNode(node, callGraph) {
  const children = callGraph[node._rawName];
  if (!children) return;

  node.children = Object.entries(children).map(([name, count]) => ({
    name: `${name} (${count})`,
    _rawName: name,
    _expanded: false,
    children: []
  }));

  node._expanded = true;
}

// Collapse a node (remove its children)
function collapseNode(node) {
  node.children = [];
  node._expanded = false;
}

// Render the tree
function renderTree(treeData, callGraph) {
  svg1.selectAll("*").remove();
  const root = d3.hierarchy(treeData);
  root.x0 = 0;
  root.y0 = 0;

  const dynHeight = Math.max(baseHeight, root.descendants().length * 30);
  const dynWidth = Math.max(baseWidth, (root.height + 1) * 160);
  svg1.attr("width", dynWidth).attr("height", dynHeight);

  const treeLayout = d3.tree().size([dynHeight, dynWidth - 150]);
  treeLayout(root);

  const fakeMargin = 50;

  // Links
  svg1.selectAll("path.link")
    .data(root.links())
    .join("path")
    .attr("class", "link")
    .transition().duration(300)
    .attr("d", d3.linkHorizontal()
      .x(d => d.y + fakeMargin)
      .y(d => d.x)
    );

  // Nodes
  const node = svg1.selectAll("g.node")
    .data(root.descendants())
    .join(enter => {
      const g = enter.append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y + fakeMargin},${d.x})`);
      g.append("circle")
        .attr("r", 5)
        .style("cursor", d => d.data._rawName ? "pointer" : "default")
        .on("mouseover", (event, d) => {
          if (!d.data._rawName) return;
          tooltip.transition().duration(200).style("opacity", 1);
          tooltip.html(d.data._expanded ? "Click to collapse" : "Click to expand")
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY - 28}px`);
        })
        .on("mousemove", event => {
          tooltip.style("left", `${event.pageX + 10}px`)
                 .style("top", `${event.pageY - 28}px`);
        })
        .on("mouseout", () => {
          tooltip.transition().duration(300).style("opacity", 0);
        })
        .on("click", (event, d) => {
          if (!d.data._rawName) return;
          if (d.data._expanded) {
            collapseNode(d.data);
          } else {
            expandNode(d.data, callGraph);
          }
          renderTree(treeData, callGraph);
        });

      g.append("text")
        .attr("dy", ".35em")
        .attr("x", d => d.children?.length ? -10 : 10)
        .style("text-anchor", d => d.children?.length ? "end" : "start")
        .text(d => d.data.name);
      return g;
    });
}

/////////////////////////////////////////////////


//BAR GRAPH /////////////////////////////////////
const svg2 = d3.select("#h_bar"),
  margin = {top: 50, right: 30, bottom: 0, left: 115},
  width2 = +svg2.attr("width") - margin.left - margin.right,
  barStep = 27,
  barPadding = 3,
  duration = 750;

let barHeight = barStep - barPadding;

function setBarHeight (node) {
  const needed = node.children.length * barStep + margin.top + margin.bottom;
  svg2.attr("height", needed);
}

// helper function to make data into a full hierarchy under a fake root
function buildHierarchy(data) {
  // For each function, create a node whose children are its individual-call durations
  const children = Object.entries(data.functions).map(([name, fnData]) => ({
    name,
    value: fnData.totalTimeMs || 0,
    // build one child per invocation (so you can drill down)
    children: Array.isArray(fnData.durationsMs)
      ? fnData.durationsMs.map((duration, i) => ({
          name: `${name} call ${i + 1}`,
          value: duration
        }))
      : undefined
  }));

  return {
    name: "main",
    children
  };
}

d3.json("data/profile_output.json").then(rawData => {

  const hierarchyData = buildHierarchy(rawData);

  const x = d3.scaleLinear().range([0, width2]);

  const hierarchy = d3.hierarchy(hierarchyData)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

  //For traversing the heirarchy
  let root = hierarchy;
  let current = root; 
  setBarHeight(root);
  let transitioning = false;

  svg2.append("rect") // BG rect to go back
  .attr("class", "background")
  .attr("fill",  `rgb(214, 210, 223)`)
  .attr("width", baseWidth + 200)
  .attr("height", baseHeight)
  .on("click", (event) => up(current));  // clicking goes "up" one level

  //Builds the bars
  function bar(svg, data, selector) {
    current = data;
    svg.datum(data);

    //main graph area
    const g = svg.insert("g", selector)
      .attr("class", "bar")
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .attr("text-anchor", "end")
      .style("shape-rendering", "crispEdges");

    const bar = g.selectAll("g")
      .data(data.children)
      .join("g")
      .attr("transform", (d, i) => `translate(0,${i * barStep})`)
      .style("cursor", d => d.children ? "pointer" : "default")
      .on("click", (event, d) => downFn(d)); //go deeper into the layers

    bar.append("text")
      .attr("x", -6)
      .attr("y", barHeight / 2)
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .text(d => d.data.name)
      .attr("fill-opacity", 0)
      .transition().duration(duration)
      .attr("fill-opacity", 1);

    bar.append("rect") //actual bars
      .attr("x", 0)
      .attr("width", d => x(d.value))
      .attr("height", barHeight)
      .attr("fill-opacity", 0)
      .on("mouseover", function(event, d) {
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(`${d.value.toFixed(4)} ms`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        tooltip.transition().duration(300).style("opacity", 0);
      })
      .transition().duration(duration)
      .attr("fill-opacity", 1);
  }
      
  //function for moving down the heirarchy
  function downFn(d) {
    if (transitioning || !d.children) return;
    transitioning = true;

    setBarHeight(d);

    x.domain([0, d3.max(d.children, c => c.value)]);

    // Update axis with transition
    svg2.select(".x-axis")
      .transition()
      .duration(duration)
      .call(d3.axisTop(x).ticks(baseWidth / 80, "s"));
  
    const oldBar = svg2.select(".bar");
  
    // fade old out and slide up
    oldBar.transition()
      .duration(duration)
      .attr("transform", `translate(${margin.left},${margin.top - 20})`)
      .attr("opacity", 0)
      .remove()
      .end()
      .then(() => {
        transitioning = false;
      });
  
    // render new bar with initial state and slide in (same as earlier)
    const g = svg2.append("g")
      .attr("class", "bar")
      .attr("transform", `translate(${margin.left + 100},${margin.top})`)
      .attr("opacity", 0);
  
    const bars = g.selectAll("g")
      .data(d.children)
      .join("g")
      .attr("transform", (d, i) => `translate(0,${i * barStep})`)
      .style("cursor", d => d.children ? "pointer" : "default")
      .on("click", (event, d) => downFn(d));
  
    bars.append("text")
      .attr("x", -6)
      .attr("y", barHeight / 2)
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .text(d => d.data.name);
      
  
    bars.append("rect")
      .attr("x", 0)
      .attr("width", d => x(d.value))
      .attr("height", barHeight)
      .on("mouseover", function(event, d) {
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(`${d.value.toFixed(4)} ms`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        tooltip.transition().duration(300).style("opacity", 0);
      });
  
    g.transition()
      .duration(duration)
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .attr("opacity", 1);
  
    svg2.datum(d);
    current = d;
  }

  //function for moving up the hierarchy
  function up(d) {
    if (transitioning || !d.parent) return;
    transitioning = true;

    setBarHeight(d.parent);
    
    //updat x-axis
    x.domain([0, d3.max(d.parent.children, c => c.value)]);

    svg2.select(".x-axis")
      .transition()
      .duration(duration)
      .call(d3.axisTop(x).ticks(baseWidth / 80, "s"));
    
    const oldBar = svg2.select(".bar");
  
    // fade old out and slide down
    oldBar.transition()
      .duration(duration)
      .attr("transform", `translate(${margin.left},${margin.top + 20})`)
      .attr("opacity", 0)
      .remove()
      .end()
      .then(() => {
        transitioning = false;
      });
  
    // render parent bar sliding in
    const g = svg2.append("g")
      .attr("class", "bar")
      .attr("transform", `translate(${margin.left - 100},${margin.top})`)
      .attr("opacity", 0);
  
    const bars = g.selectAll("g")
      .data(d.parent.children)
      .join("g")
      .attr("transform", (d, i) => `translate(0,${i * barStep})`)
      .style("cursor", d => d.children ? "pointer" : "default")
      .on("click", (event, d) => downFn(d));
  
    bars.append("text")
      .attr("x", -6)
      .attr("y", barHeight / 2)
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .text(d => d.data.name);
  
    bars.append("rect")
      .attr("x", 0)
      .attr("width", d => x(d.value))
      .attr("height", barHeight)
      .on("mouseover", function(event, d) {
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(`${d.value.toFixed(4)} ms`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        tooltip.transition().duration(300).style("opacity", 0);
      });
  
    g.transition()
      .duration(duration)
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .attr("opacity", 1);
  
    svg2.datum(d.parent);
    current = d.parent;
  }
    

  //builds graph
  x.domain([0, d3.max(root.children, c => c.value)]);
  bar(svg2, root);

  //adds the line in the x-axis
  svg2.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(${margin.left},${margin.top})`)
    .call(d3.axisTop(x).ticks(baseWidth / 80, "s"));

  //adds the line in the y-axis
  svg2.append("line")
    .attr("x1", margin.left)
    .attr("x2", margin.left)
    .attr("y1", margin.top)
    .attr("y2", baseHeight - margin.bottom - 30)
    .attr("stroke", "#000")
    .attr("stroke-width", 1);

  //adds the text in the x-axis
  svg2.append("text")
    .attr("class", "x-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", margin.left + (baseWidth - margin.left - margin.right) / 2)
    .attr("y", margin.top - 25) // adjust as needed (negative moves it above axis)
    .text("Total Time (ms)");

});

/////////////////////////////////////////////////

