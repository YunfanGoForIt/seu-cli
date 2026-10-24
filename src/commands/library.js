import { invalidArgument, requireFetchBackend } from '../errors.js';

export async function librarySearch({ backend }, options = {}, positionals = []) {
  requireFetchBackend(backend);
  const keyword = positionals[0];
  if (!keyword) throw invalidArgument('Usage: seu-cli library search <keyword>');
  return backend.librarySearch(keyword, {
    page: options.page ?? 1,
    pageSize: options.limit ?? 20
  });
}

export async function libraryItem({ backend }, _options = {}, positionals = []) {
  requireFetchBackend(backend);
  const marcNo = positionals[0];
  if (!marcNo) throw invalidArgument('Usage: seu-cli library item <marcNo>');
  return backend.libraryItem(marcNo);
}

export async function libraryLoans({ backend }) {
  requireFetchBackend(backend);
  return backend.libraryLoans();
}

export async function libraryHistory({ backend }, options = {}) {
  requireFetchBackend(backend);
  return backend.libraryHistory(options.page ?? 1);
}
