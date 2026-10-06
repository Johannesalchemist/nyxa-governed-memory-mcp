const READ_ONLY_TOOL = /^(find_many_|find_one_|group_by_)[a-z0-9_]+$/;

export function isTwentyReadToolName(name) {
  return typeof name === 'string' && READ_ONLY_TOOL.test(name);
}

export function authorizeTwentyReadTool(name, catalogNames) {
  if (!isTwentyReadToolName(name)) return false;
  if (!Array.isArray(catalogNames)) return false;
  return catalogNames.includes(name);
}
