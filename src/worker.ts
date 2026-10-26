import { dataset, type Dataset, type Delimiter } from './csv.js';
import { analyze, defaults, type Rules } from './quality.js';
type Request =
  | { id: number; text: string; delimiter: Delimiter | 'auto'; rules?: undefined }
  | { id: number; rules: Rules; text?: undefined };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (value: unknown) => void;
};
let data: Dataset | undefined;
scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.text !== undefined) data = dataset(request.text, request.delimiter);
    if (!data) throw new Error('Choose a file first');
    const rules = request.rules ?? defaults(data.headers);
    scope.postMessage({
      id: request.id,
      ok: true,
      analysis: analyze(data, rules),
      rules,
      delimiter: data.delimiter,
    });
  } catch (error) {
    data = undefined;
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to check this file',
    });
  }
};
