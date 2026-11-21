// The SDK names an alias row by family only ("Opus"). The version comes from the id it resolves to
// (claude-opus-5-5 -> 5.5), so the model menu says which model a choice really runs. A trailing date is not a version.
export function modelName(displayName: string, id: string): string {
  if (/\d/.test(displayName)) return displayName
  const match = /^claude-[a-z]+-(\d{1,2}(?:-\d{1,2})?)(?:-\d{8})?$/.exec(id)
  return match ? `${displayName} ${match[1].replace('-', '.')}` : displayName
}
