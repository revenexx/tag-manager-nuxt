import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema from '../../contract/theme-events.schema.json'

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
export const ajvValidate = ajv.compile(schema)
export { schema }
