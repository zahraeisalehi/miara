> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# edit dns record

> you can not edit type of dns record



## OpenAPI

````yaml /spec/dns.yaml put /api/v1/zones/{zone}/dns-records/{id}
openapi: 3.0.1
info:
  title: DNS
  description: |-
    Manage dns zones and records

    Parameters:
    - `teamID`: To access services in a team
  termsOfService: '#'
  contact:
    email: info@liara.ir
  version: 1.0.0
servers:
  - url: https://dns-service.liara.ir
security:
  - jwt: []
tags:
  - name: Zone
    description: Everything about your Zones
  - name: Check Name Servers
    description: Check Name Servers endpoints
  - name: Dns Record
    description: Dns Record of your zones
externalDocs:
  description: Find out more about DNS
  url: http://liara.ir
paths:
  /api/v1/zones/{zone}/dns-records/{id}:
    put:
      tags:
        - Dns Record
      summary: edit dns record
      description: you can not edit type of dns record
      operationId: editDnsRecord
      parameters:
        - name: zone
          in: path
          description: The name of the zone to edit dns record
          required: true
          schema:
            type: string
        - name: id
          in: path
          description: The id of dns record to edit its data
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Dns-record'
        required: true
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Dns-record-response'
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: Zone does not exists.
          content: {}
        '409':
          description: Conflict
          content: {}
components:
  schemas:
    Dns-record:
      type: object
      properties:
        name:
          type: string
          description: >-
            The name of dns record, "@" for zone name(root level), "*" for wild
            card and any valid value with RFC 1123
        type:
          type: string
          description: >-
            The type of dns record, valid values: [A, AAAA, TXT, CNAME, ALIAS,
            MX, SRV, SPF, PTR]
        ttl:
          type: number
          description: >-
            The ttl of dns record, is not required, valid values: [120, 180,
            300, 600, 900, 1800, 3600, 7200, 18000, 43200, 86400, 172800,
            432000]
        contents:
          type: array
          description: Array of content of dns record, change base on type of dns record
          items:
            type: object
            properties: {}
    Dns-record-response:
      type: object
      properties:
        status:
          type: string
          description: success
        data:
          $ref: '#/components/schemas/Dns-record-id'
    Dns-record-id:
      type: object
      properties:
        id:
          type: string
          description: The id of dns record which need in PUT, DELETE and GET method
        name:
          type: string
          description: >-
            The name of dns record, "@" for zone name(root level), "*" for wild
            card and any valid value with RFC 1123
        type:
          type: string
          description: >-
            The type of dns record, valid values: [A, AAAA, TXT, CNAME, ALIAS,
            MX, SRV, CAA]
        ttl:
          type: number
          description: >-
            The ttl of dns record, is not required, valid values: [120, 180,
            300, 600, 900, 1800, 3600, 7200, 18000, 43200, 86400, 172800,
            432000]
        contents:
          type: array
          description: Array of content of dns record, change base on type of dns record
          items:
            type: object
            properties: {}
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.