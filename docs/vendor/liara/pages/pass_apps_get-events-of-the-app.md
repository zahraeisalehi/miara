> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get events of the app

> get events of the app owned by user



## OpenAPI

````yaml /spec/paas.yaml get /v1/projects/{name}/events
openapi: 3.0.1
info:
  title: PaaS
  description: >-
    Manage your apps using our API


    [wss://api.liara.ir?token=<api-token>&cmd=/bin/bash&project_id=<project-id>](

    wss://api.liara.ir?token=<api-token>&cmd=/bin/bash&project_id=<project-id>)


    Parameters:

    - `token`: Your api token in liara

    - `cmd`: By default /bin/bash

    - `project_id`: The id of your project in liara

    - `teamID`: To access services in a team


    This `WebSocket` endpoint allows `real-time`

    communication with the projects service hosted

    at `Liara` You can use `WebSocket protocols`

    to send and receive data, enabling efficient and

    low-latency interactions with the projects
  termsOfService: '#'
  contact:
    email: info@liara.ir
  version: 1.0.0
servers:
  - url: https://api.liara.ir
security:
  - jwt: []
  - bearerAuth: []
tags:
  - name: Apps
    description: Everything about your Apps
  - name: Deploy
    description: Deploy endpoints
  - name: Settings
    description: Settings of your app
  - name: Disks
    description: Disks of your app
  - name: Domains
    description: Domains of your app
  - name: Reports
    description: Reports of your app
externalDocs:
  description: Find out more about PaaS
  url: http://liara.ir
paths:
  /v1/projects/{name}/events:
    get:
      tags:
        - Apps
      summary: Get events of the app
      description: get events of the app owned by user
      operationId: getAppEvents
      parameters:
        - name: name
          in: path
          description: The name of the app
          required: true
          schema:
            type: string
        - name: search
          in: query
          description: Show events based on search query
          required: false
          schema:
            type: string
        - name: start
          in: query
          description: start timestamp
          example: 1704028315
          required: false
          schema:
            type: number
        - name: end
          in: query
          description: end timestamp
          example: 1704028315
          required: false
          schema:
            type: number
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                required:
                  - data
                type: object
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        metaData:
                          type: object
                        values:
                          type: array
                          items:
                            type: array
                            items:
                              type: string
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: App does not exists.
          content: {}
components:
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.