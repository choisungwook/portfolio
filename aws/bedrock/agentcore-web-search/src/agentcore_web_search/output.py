from openai.types.responses import Response


def print_response(response: Response) -> None:
  """Print Web Search retrieval steps, answer text, and URL citations."""
  searches = [item for item in response.output if item.type == "web_search_call"]
  print(f"Retrieval steps: {len(searches)}")
  for call in searches:
    if call.action.type == "search":
      print(f"  search: {call.action.queries}")
    elif call.action.type == "open_page":
      print(f"  open_page: {call.action.url}")
    elif call.action.type == "find_in_page":
      print(f"  find_in_page: {call.action.url} ({call.action.pattern})")

  for item in response.output:
    if item.type != "message":
      continue
    for content in item.content:
      if content.type != "output_text":
        continue
      print(content.text)
      for citation in content.annotations or []:
        if citation.type == "url_citation":
          print(f"  [{citation.title}] {citation.url}")
