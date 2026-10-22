> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# check nameserver

> check nameserver of zone



## OpenAPI

````yaml /spec/dns.yaml put /api/v1/zones/{zone}/check
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
  /api/v1/zones/{zone}/check:
    put:
      tags:
        - Check Name Servers
      summary: check nameserver
      description: check nameserver of zone
      operationId: checkNameServer
      parameters:
        - name: zone
          in: path
          description: The name of the zone to check status
          required: true
          schema:
            type: string
      responses:
        '201':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Submitted'
        '400':
          description: bad request maybe validation error on zone name
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: Zone does not exists or its status is not pending
          content: {}
        '406':
          description: Please try later.
          content: {}
        '500':
          description: server does not response
          content: {}
components:
  schemas:
    Submitted:
      type: object
      properties:
        status:
          type: string
          description: succes
        data:
          type: string
          description: Your request has been submitted.
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.