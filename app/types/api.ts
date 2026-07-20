export interface ApiParam {
  name: string
  in: 'query' | 'path'
  required: boolean
  type: string
  description: string
}

export interface ApiBody {
  contentType: string
  schema: unknown
}

export interface ApiEndpoint {
  tag: string
  method: string
  path: string
  summary: string
  rawSummary: string
  description: string
  statusFlag: 'modify-planned' | 'delete-planned' | null
  params: ApiParam[]
  body: ApiBody[] | null
}
