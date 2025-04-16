//GLOBAL STUFF //////////////////////////////////
const tooltip = d3.select("#tooltip");
/////////////////////////////////////////////////

//TREE GRAPH ////////////////////////////////////
const width = 600;
const height = 400;
const svg1 = d3.select("#tree")


//Read from output to make tree
d3.json("data/profile_output.json").then(raw => {
  //const treeData = callGraphToTree(raw.callGraph); // start collapsed
  buildTree(raw.callGraph, false);  

}).catch(console.error);


// builds the tree according to the data
function buildTree(data, expand) {
  const treeData = expand ? callGraphToTreeWithFullRepeats(data) : callGraphToTree(data); // transform
  const root = d3.hierarchy(treeData);
  const treeLayout = d3.tree().size([height, width - 150]);
  treeLayout(root);

  const fakeMargin = 50; //moves everything to the right a bit

  // Links (strings)
  svg1.selectAll("path.link")
    .data(root.links())
    .join("path")
    .attr("class", "link")
    .attr("d", d3.linkHorizontal()
      .x(d => d.y + fakeMargin)
      .y(d => d.x)
    )
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", 1);
      tooltip.html(expand ? 'Collapse' : `Expand`)
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
    .on("click", () => { //go to expanded graph
      svg1.selectAll("*").remove();
      tooltip.transition().duration(300).style("opacity", 0);
      buildTree(data, !expand);
    });

  // Nodes
  const node = svg1.selectAll("g.node")
    .data(root.descendants())
    .join("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.y  + fakeMargin},${d.x})`);

  node.append("circle").attr("r", 5)
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", 1);
      tooltip.html( expand ? 'Collapse' : `Expand`)
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
    .on("click", () => { //go to expanded graph
      svg1.selectAll("*").remove();
      tooltip.transition().duration(300).style("opacity", 0);
      buildTree(data, !expand);
    }); 

  node.append("text")
    .attr("dy", "0.31em")
    .attr("x", d => d.children ? -10 : 10)
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", 1);
      tooltip.html(expand ? 'Collapse' : `Expand`)
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
    .on("click", () => { //go to expanded graph
      svg1.selectAll("*").remove();
      tooltip.transition().duration(300).style("opacity", 0);
      buildTree(data, !expand);
    })
    .style("text-anchor", d => d.children ? "end" : "start")
    .text(d => d.data.name);
}

// Helper to convert callGraph object to a collapsed tree
function callGraphToTree(obj, name = "main") {
  const result = { name, children: [] };

  for (const [func, val] of Object.entries(obj)) {
    if (typeof val === 'number') {
      // Leaf node with count — add a single node
      if (name === "main" && val !== 1) {
        result.children.push({ name: func + ` (x${val})` });
      }
      else {
        result.children.push({ name: func });
      }
      
    } else if (typeof val === 'object') {
      // Determine how many times this entire path was called
      const repeatCount = getRepeatCount(val);

      var subtree;

      // Recursively generate the subtree
      
      if (name === "main" && repeatCount !== 1) {
          subtree = callGraphToTree(val, func + ` (x${repeatCount})`);
      }
      else {
        subtree = callGraphToTree(val, func);
      }

      result.children.push(deepClone(subtree));

    }
  }

  return result;
}

// Helper to convert callGraph object to a D3 tree EXPANDED
function callGraphToTreeWithFullRepeats(obj, name = "main") {
  const result = { name, children: [] };

  for (const [func, val] of Object.entries(obj)) {
    if (typeof val === 'number') {
        if (name === "main" && val !== 1) {
          for (let i = 0; i < val; i++) {
            result.children.push({ name: func });
          }
        }
        else {
          result.children.push({ name: func });
        }
      }
    else if (typeof val === 'object') {
      // Recursively process subgraph
      const subtree = callGraphToTreeWithFullRepeats(val, func);

      // How many times should the entire subtree be repeated?
      const repeatCount = getRepeatCount(val);

      for (let i = 0; i < repeatCount; i++) {
        // Deep copy subtree
        result.children.push(deepClone(subtree));
      }
    }
  }

  return result;
}

// Helper to extract the repeat count of a subtree
function getRepeatCount(subtree) {
  // If it ends in a number, that's the count
  for (const val of Object.values(subtree)) {
    if (typeof val === 'number') return val;
    if (typeof val === 'object') return getRepeatCount(val);
  }
  return 1;
}

// Helper to deep clone tree nodes
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
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



// helper function to make data into a full hierarchy under a fake root
function buildHierarchy(data) {
  const seen = new Set();

  function recurse(name, node) {
    const fnData = data.functions[name] || {};
    const children = [];

    // Each key inside this node is a nested function name
    for (const [childName, childNode] of Object.entries(node)) {
      seen.add(childName);
      children.push(recurse(childName, childNode));
    }

    return {
      name,
      value: fnData.totalTimeMs || 0,
      children: children.length > 0 ? children : undefined
    };
  }

  const children = [];

  for (const [name, node] of Object.entries(data.callGraph)) {
    seen.add(name);
    children.push(recurse(name, node));
  }

  // Orphaned functions (not in callGraph)
  for (const [name, fnData] of Object.entries(data.functions)) {
    if (!seen.has(name)) {
      children.push({
        name,
        value: fnData.totalTimeMs
      });
    }
  }

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
  let transitioning = false;

  svg2.append("rect") // BG rect to go back
  .attr("class", "background")
  .attr("fill",  `rgb(214, 210, 223)`)
  .attr("width", width)
  .attr("height", height)
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

    
    x.domain([0, d.value]);

    // Update axis with transition
    svg2.select(".x-axis")
      .transition()
      .duration(duration)
      .call(d3.axisTop(x).ticks(width / 80, "s"));
  
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
    
    //updat x-axis
    x.domain([0, d.parent.value]);

    svg2.select(".x-axis")
      .transition()
      .duration(duration)
      .call(d3.axisTop(x).ticks(width / 80, "s"));
    
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
  x.domain([0, root.value]);
  bar(svg2, root);

  //adds the line in the x-axis
  svg2.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(${margin.left},${margin.top})`)
    .call(d3.axisTop(x).ticks(width / 80, "s"));

  //adds the line in the y-axis
  svg2.append("line")
    .attr("x1", margin.left)
    .attr("x2", margin.left)
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom - 30)
    .attr("stroke", "#000")
    .attr("stroke-width", 1);

  //adds the text in the x-axis
  svg2.append("text")
    .attr("class", "x-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", margin.left + (width - margin.left - margin.right) / 2)
    .attr("y", margin.top - 25) // adjust as needed (negative moves it above axis)
    .text("Total Time (ms)");

});

/////////////////////////////////////////////////

