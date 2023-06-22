
import type { SearchEvent, ICollector, TelemetryConfig } from './types.js'
import { version } from '../package.json'

type Data = object[]

export class Collector {
  private data: Data
  private params?: ICollector
  private readonly config: CollectorConstructor

  private constructor (config: CollectorConstructor) {
    this.data = []
    this.config = config
  }

  public setParams (params: ICollector): void {
    this.params = params
  }

  public static create (config: CollectorConstructor): Collector {
    const collector = new Collector(config)
    collector.start()
    return collector
  }

  public add (data: SearchEvent): void {
    this.data.push({
      rawSearchString: data.rawSearchString,
      query: data.query,
      resultsCount: data.resultsCount,
      roundTripTime: data.roundTripTime,
      searchedAt: data.searchedAt,
      // The referer is different for every event:
      // the user can search in different pages of the website
      // and the referer will be different for each page
      referer: typeof location !== 'undefined' ? location.toString() : undefined
    })

    if (this.params && this.data.length >= this.config.flushSize) {
      this.flush()
    }
  }

  public flush (): void {
    if (!this.params || this.data.length === 0) {
      return
    }

    // Swap out the data array *sync*
    // so that we can continue to collect events
    const data = this.data
    this.data = []

    const body = {
      source: 'fe',
      deploymentID: this.params.deploymentID,
      index: this.params.index,
      oramaId: this.config.id,
      oramaVersion: version,
      // The user agent is the same for every event
      // Because we use "application/x-www-form-urlencoded",
      // the browser doens't send the user agent automatically
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      events: data,
    }

    navigator.sendBeacon?.(
      this.params.endpoint + `?api-key=${this.config.api_key}`, 
      JSON.stringify(body)
    )
  }

  private start (): void {
    setInterval(this.flush.bind(this), this.config.flushInterval)
  }
}

export interface CollectorConstructor extends TelemetryConfig {
  id: string,
  api_key: string,
}
