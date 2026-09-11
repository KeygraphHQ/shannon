// Simulated production bundle for the search page (offline fixture — not real code)
function renderResults(container) {
  const params = new URLSearchParams(location.search);
  const query = params.get('q');
  const resultsHtml = buildResultsMarkup(query);
  container.innerHTML = resultsHtml;
}

function fetchMoreResults(cursor) {
  return fetch('/api/v2/results?cursor=' + cursor).then((r) => r.json());
}
