> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get all domains

> get all domains that user owns



## OpenAPI

````yaml /spec/paas.yaml get /v1/domains
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
  /v1/domains:
    get:
      tags:
        - Domains
      summary: Get all domains
      description: get all domains that user owns
      operationId: getAppDomains
      parameters:
        - name: project
          in: query
          description: The name of your app
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Domains'
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
  schemas:
    Domains:
      type: object
      properties:
        domains:
          type: array
          items:
            type: object
            properties:
              _id:
                type: string
                description: The id of domain
              name:
                type: string
                description: The name of domain
              type:
                type: string
                description: The type of domain
              project:
                type: object
                properties:
                  _id:
                    type: string
                    description: The id of project
                  project_id:
                    type: string
                    description: The name of project
                description: The type of domain
              status:
                type: string
                description: The status of domain
              certificatesStatus:
                type: string
                description: The certificatesStatus of domain
              redirectTo:
                type: string
                description: The redirectTo of domain
              redirectStatus:
                type: number
                description: The redirectStatus of domain
              created_at:
                type: string
                description: The created_at of domain
              CNameRecord:
                type: string
                description: The CNameRecord of domain
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