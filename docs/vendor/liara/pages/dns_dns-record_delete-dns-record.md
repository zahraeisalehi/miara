> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# delete dns record

> Delete dns record from this zone



## OpenAPI

````yaml /spec/dns.yaml delete /api/v1/zones/{zone}/dns-records/{id}
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
    delete:
      tags:
        - Dns Record
      summary: delete dns record
      description: Delete dns record from this zone
      operationId: deleteDnsRecord
      parameters:
        - name: zone
          in: path
          description: The name of the zone to delete dns record
          required: true
          schema:
            type: string
        - name: id
          in: path
          description: The id of dns record to delete its data
          required: true
          schema:
            type: string
      responses:
        '204':
          description: Successful operation
          content: {}
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: Zone does not exists.
          content: {}
components:
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.