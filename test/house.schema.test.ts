import Ajv from 'ajv';
import { describe, it } from 'vitest';
import schema from '../house.schema.json';
import { sampleHouse } from '../src/lib/sampleHouse';

const ajv = new Ajv({ allErrors: true, strict: false });

describe('house.schema.json', () => {
  it('sampleHouse validates against schema', () => {
    const validate = ajv.compile(schema as any);
    const ok = validate(sampleHouse as any);
    if (!ok) {
      console.error('Validation errors', validate.errors);
    }
    if (!ok) throw new Error('sampleHouse does not validate against house.schema.json');
  });
});
