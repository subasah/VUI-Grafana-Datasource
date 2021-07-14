import {
  CircularDataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  guessFieldTypeFromValue,
  MutableDataFrame,
} from '@grafana/data';

import { defaultQuery, MyDataSourceOptions, MyQuery } from './types';

import { FetchResponse, getBackendSrv } from '@grafana/runtime';
import { Observable /*, merge*/ } from 'rxjs';
import { defaults } from 'lodash';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  url?: string;
  path: string;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    console.log('before super, instanceSettings.url is: ' + instanceSettings.url);
    super(instanceSettings);

    console.log('instanceSettings.url is: ' + instanceSettings.url);
    this.url = instanceSettings.url;
    console.log('In constructor this.url is: ' + this.url);
    this.path = instanceSettings.jsonData.path || '';
  }

  doRequest(query: MyQuery, request_type: string) {
    console.log('in doRequest, query is: ');
    console.log(query);
    const routePath = request_type === 'websocket' ? '/vuiwebsock' : '/volttron';
    const url = this.url + routePath + '/vui' + query.route;
    const request: any = {
      method: query.http_method,
      url: url,
      data: query.data,
    };
    console.log('HTTP_METHOD is: ' + query.http_method);
    // if (query.http_method === 'POST' || query.http_method === 'PUT') {
    //   request.data = {};
    // }
    console.log('request is: ');
    console.log(request);
    return getBackendSrv().fetch(request); //.toPromise();
  }

  // TODO: This just displays the json response from the API in the panel. This is a (generally not useful) placeholder.
  process_generic(query: MyQuery, response: any): MutableDataFrame {
    const frame = new MutableDataFrame({
      refId: query.refId,
      fields: [{ name: 'Response Value', type: FieldType.string }],
    });
    frame.add({ 'Response Value': JSON.stringify(response.data) });
    return frame;
  }

  // TODO: This only handles the (neither common nor guaranteed) case where the RPC POST returns a list of objects.
  process_platform_agents_rpc_method(query: MyQuery, response: any): MutableDataFrame {
    if (query.http_method === 'POST') {
      let fields = [];
      if (Array.isArray(response.data)) {
        //const keys = Object.keys(response.data[0]);
        //const types = Object.values(response.data[0]).map(x => typeof x);
        for (let k in response.data[0]) {
          fields.push({ name: k, type: guessFieldTypeFromValue(response.data[0][k]) });
        }

        const frame = new MutableDataFrame({
          refId: query.refId,
          fields: fields,
        });
        response.data.forEach((row: any) => {
          frame.add(row);
        });
        return frame;
      } else {
        return this.process_generic(query, response);
      }
    } else {
      return this.process_generic(query, response);
    }
  }

  // process_time_series(query: MyQuery, response: Observable<DataQueryResponse>): Observable<DataQueryResponse> {
  //   console.log('IN PROCESS TIME SERIES:');
  //   //if (query.http_method === 'GET') {
  //   console.log('Query is a GET');
  //   let observable = new Observable<DataQueryResponse>((subscriber) => {
  //     console.log('In Observable subscribe.');
  //     const frame = new CircularDataFrame({
  //       append: 'tail',
  //       capacity: 1000,
  //     });
  //     console.log('FRAME CREATED');
  //     frame.refId = query.refId;
  //     console.log('FRAME IS:');
  //     console.log(frame);
  //     frame.addField({ name: 'Time', type: FieldType.string });
  //     console.log('TIME FIELD ADDED');
  //     frame.addField({
  //       name: 'value',
  //       type: FieldType.number /*guessFieldTypeFromValue(response.data.values[0][1])*/,
  //     });
  //     console.log('VALUE FIELD ADDED');
  //     response.data.values.forEach(() => {
  //       console.log('IN FOREACH');
  //       for (let row in response.data.values.topic) {
  //         console.log('ADDING ROW:');
  //         console.log(row);
  //         frame.add(row);
  //       }
  //     });
  //     console.log('ROWS PACKED');
  //     subscriber.next({
  //       data: [frame],
  //       key: query.refId,
  //     });
  //   });
  //   console.log('OBSERVABLE AT END OF PROCESS_TIME_SERIES IS:');
  //   console.log(observable);
  //   return observable;
  //   /* } else {
  //     return this.process_generic(query, response);
  //   }*/
  // }

  new_process_time_series(
    query: MyQuery,
    options: DataQueryRequest,
    response: Observable<FetchResponse>
  ): Observable<DataQueryResponse> {
    console.log('IN NEW PROCESS TIME SERIES (NPTS):');
    let observable = new Observable<DataQueryResponse>((subscriber) => {
      console.log('In NPTS Observable subscribe.');
      const frame = new CircularDataFrame({
        append: 'tail',
        capacity: options.maxDataPoints,
      });
      console.log('FRAME CREATED as:');
      console.log(frame);
      if (frame.fields.length === 0) {
        console.log('FRAME.fields  IS EMPTY -- ADDING FIELDS');
        frame.refId = query.refId;
        frame.addField({ name: 'Time', type: FieldType.time });
        console.log('Time field added.');
        frame.addField({
          name: 'value',
          type: FieldType.number /* TODO: guessFieldTypeFromValue(response.data.values[0][1])*/,
        });
        console.log('Value field added.');
        console.log('FRAME IS NOW:');
        console.log(frame);
      } else {
        console.log('FRAME HAS FIELDS -- NO NEED TO ADD THEM.');
      }
      response.subscribe({
        next(x) {
          console.log('IN RESPONSE.SUBSCRIBE.NEXT: X is:');
          console.log(x);
          for (const topic in x.data) {
            if (!['metadata', 'units', 'type', 'tz'].includes(topic)) {
              for (const row in x.data[topic]['value']) {
                console.log('x.data[topic].value[row] has:');
                console.log(x.data[topic].value[row]);
                frame.add({ Time: x.data[topic]['value'][row][0], value: x.data[topic]['value'][row][1] });
                subscriber.next({
                  data: [frame],
                  key: query.refId,
                });
              }
            }
          }
        },
        error(err) {
          console.log('ERROR FROM Response.subscribe(): ' + err);
        },
        complete() {
          subscriber.complete();
        },
      });
      // response.data.values.forEach(() => {
      //   console.log('IN FOREACH');
      //   for (let row in response.data.values.topic) {
      //     console.log('ADDING ROW:');
      //     console.log(row);
      //     frame.add(row);
      //   }
      // });
    });
    console.log('OBSERVABLE AT END OF PROCESS_TIME_SERIES IS:');
    console.log(observable);
    return observable;
    /* } else {
      return this.process_generic(query, response);
    }*/
  }

  query(options: DataQueryRequest<MyQuery>): any /*Observable<DataQueryResponse>*/ {
    console.log('IN DATASOURCE: the DataQueryRequest<MyQuery> called options is: ');
    console.log(options);
    const observables = options.targets.map((target) => {
      const query = defaults(target, defaultQuery);
      console.log('MAX DATA POINTS IS: ' + options.maxDataPoints);
      query.route = query.route + '/?count=' + options.maxDataPoints;
      //return this.new_process_time_series(query, response);
      //return this.doRequest(query).then((response) => {
      /*if (query.route?.match(/^\/platforms\/(?<platform>.+)\/agents\/(?<agent>.+)\/rpc\/(?<method>.+)\/?$/)) {
          return this.process_platform_agents_rpc_method(query, response);
        } else*/ if (
        query.route?.match(/^\/platforms\/(?<platform>.+)\/historians\/(?<agent>.+)\/topics\/(?<topic>.+)\/?$/)
      ) {
        let response = this.doRequest(query, 'http');
        return this.new_process_time_series(query, options, response);
      } else if (query.route?.match(/^\/platforms\/(?<platform>.+)\/pubsub\/(?<topic>.+)\/?$/)) {
        let response = this.doRequest(query, 'websocket');
        return this.new_process_time_series(query, options, response);
      } else {
        return [{}];
        //return this.process_generic(query, response);
      }
    });
    //console.log('BEFORE RETVAL');
    console.log('OBSERVABLES IS');
    console.log(observables);
    //let retval = observables;
    //let retval = Promise.all(promises).then((data) => ({ data }));
    //console.log('RETVAL IS: ');
    //console.log(retval);
    //return retval;
    // @ts-ignore
    //return merge(...observables);
    return observables[0];
    //return observables;
    //schedued(observables, schedued).pipe(mergeAll());
  }

  async testDatasource() {
    // Implement a health check for your data source.
    return {
      status: 'success',
      message: 'Success',
    };
  }
}
