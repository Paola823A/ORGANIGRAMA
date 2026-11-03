// Keep the displayed coordinates and only connector junctions lying between
// selected cards. Unselected employees and their branches are never exported.
export function selectedGraph(graph, selectedIds) {
  const selected = new Set(selectedIds);
  const junctions = new Set(graph.nodes.filter(n=>n.type==='JUNCTION').map(n=>n.id));
  function reachable(reverse) {
    const seen = new Set(selected), queue = [...selected];
    const links = new Map();
    for(const e of graph.edges) {
      const from = reverse ? e.target:e.source, to = reverse ? e.source:e.target;
      if(!links.has(from)) links.set(from,[]);
      links.get(from).push(to);
    }
    for(let i=0;i<queue.length;i++) for(const id of links.get(queue[i]) || []) {
      if(!seen.has(id) && junctions.has(id)) {seen.add(id);queue.push(id);}
    }
    return seen;
  }
  const forward = reachable(false), backward = reachable(true);
  const nodes = graph.nodes.filter(n=>selected.has(n.id) || junctions.has(n.id) && forward.has(n.id) && backward.has(n.id));
  const ids = new Set(nodes.map(n=>n.id));
  return {...graph,nodes,edges:graph.edges.filter(e=>ids.has(e.source) && ids.has(e.target))};
}
