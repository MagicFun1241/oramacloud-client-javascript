import type { Endpoint, IOramaClient, Method, OramaInitResponse } from './types.js'
import type { SearchParams } from '@orama/orama'
import { Results } from '@orama/orama'
import { formatElapsedTime } from '@orama/orama/components'
import fetchFn from './fetchFn.js'
import cuid from 'cuid'

import { Collector } from './collector.js'
import { throttle } from './throttle.js'

interface IOramaClient {
  api_key: string
  endpoint: string
  throttle?: number
}

type Endpoint =
  | 'search'
  | 'init'
  | 'info'
  | 'health'

type Method =
  | 'GET'
  | 'POST'

export class OramaClient {
  private readonly api_key: string
  private readonly endpoint: string
  private readonly collector: Promise<Collector | void>
  private readonly throttle: number | undefined

  constructor (params: IOramaClient) {
    this.api_key = params.api_key
    this.endpoint = params.endpoint
    
    if (params.throttle !== undefined) {
      this.throttle = params.throttle
      this.search = throttle(this.search.bind(this), this.throttle) as typeof this.search
    }

    this.init().catch(err => console.error(err))
    this.collector = this.init()
  }

  public async search (query: SearchParams): Promise<Results> {
    const timeStart = Date.now()
    const [results, contentEncoding] = await this.fetch<Results>('search', 'POST', query)
    const timeEnd = Date.now()
    results.elapsed = await formatElapsedTime(BigInt(timeEnd * 1_000_000 - timeStart * 1_000_000))

    this.collector.then(collector => {
      if (collector) {
        collector.add({
          rawSearchString: query.term,
          resultsCount: results.hits.length,
          roundTripTime: timeEnd - timeStart,
          contentEncoding,
          query,
          searchedAt: new Date(timeStart),
        })
      }
    })

    return results
  }

  private createCollector (body: OramaInitResponse): Collector {
    return Collector.create({
      id: cuid(),
      flushInterval: 5000,  // @todo: make this configurable?
      flushSize: 25,  // @todo: make this configurable?
      endpoint: body.collectUrl,
      api_key: this.api_key,
      deploymentID: body.deploymentID,
      index: body.index,
    })
  }

  private init () {
    return this.fetch<OramaInitResponse>('init', 'GET')
      .then(([b]) => this.createCollector(b))
      .catch(err => console.log(err))
  }

  private async fetch<T = unknown> (path: Endpoint, method: Method, body?: object): Promise<[T, string?]> {
    const res = await fetchFn(
      `${this.endpoint}/${path}`,
      method,
      { Authorization: `Bearer ${this.api_key}` },
      body
    )

    let contentEncoding = res.headers.get('Content-Encoding') || undefined

    return [await res.json(), contentEncoding]
  }
}
