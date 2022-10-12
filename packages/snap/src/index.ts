import { decode } from '@metamask/abi-utils';
import { OnTransactionHandler } from '@metamask/snap-types';
import { isObject, hasProperty, remove0x, add0x, Json, bytesToHex } from '@metamask/utils';

// The API endpoint to get a list of functions by 4 byte signature.
const API_ENDPOINT =
  'https://www.4byte.directory/api/v1/signatures/?hex_signature=';

/* eslint-disable camelcase */
type FourByteSignature = {
  id: number;
  created_at: string;
  text_signature: string;
  hex_signature: string;
  bytes_signature: string;
};
/* eslint-enable camelcase */

export const onTransaction: OnTransactionHandler = async ({ transaction }) => {
  const insights: { type: string; params?: Json } = {
    type: 'Unknown Transaction',
  };

  if (
    !isObject(transaction) ||
    !hasProperty(transaction, 'data') ||
    typeof transaction.data !== 'string'
  ) {
    console.log('Unknown transaction type.');
    return { insights };
  }

  // Fetch data from 4byte.registry

  const transactionData = remove0x(transaction.data);

  const fourBytes = transactionData.slice(0, 8);
  const response = await fetch(`${API_ENDPOINT}${add0x(fourBytes)}`, {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Unable to fetch function signature data.');
  }

  const { results } = (await response.json()) as {
    results: FourByteSignature[];
  };

  // Extract function text signature from 4byte results

  const [ matchingFunction ] = results
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((value) => value.text_signature);

  if (!matchingFunction) {
    console.log('No matching function signatures found.');
    return { insights };
  }

  // "functionName(type1,type2,...)"
  insights.type = matchingFunction;

  // Decode transaction parameters

  const parameterTypes = matchingFunction
    .slice(matchingFunction.indexOf('(') + 1, matchingFunction.indexOf(')'))
    .split(',');

  const decodedParameters = decode(
    parameterTypes,
    add0x(transactionData.slice(8))
  );

  insights.params = decodedParameters.map(normalizeAbiValue);

  // Return completed insights

  return { insights };
};

/**
 * The ABI decoder returns certain which are not JSON serializable. This
 * function converts them to strings.
 *
 * @param value - The value to convert.
 * @returns The converted value.
 */
 function normalizeAbiValue(value: unknown): Json {
  if (Array.isArray(value)) {
    return value.map(normalizeAbiValue);
  }

  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value as Json;
}
