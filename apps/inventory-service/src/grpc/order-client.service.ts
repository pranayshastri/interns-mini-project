import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROTO_PATHS } from '@repo/proto';

interface ConfirmOrderResult {
  order_id: string;
  status: string;
}

@Injectable()
export class OrderClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const dir =
      process.env.TLS_CERT_DIR ||
      resolve(__dirname, '../../../../infra/certs');

    const cert = (override: string | undefined, name: string) =>
      readFileSync(override || resolve(dir, name));

    // Fail closed: inventory client identity over mTLS, never plaintext.
    const tls = credentials.createSsl(
      cert(process.env.TLS_CA_PATH, 'ca.crt'),
      cert(process.env.TLS_KEY_PATH, 'inventory-service.key'),
      cert(process.env.TLS_CERT_PATH, 'inventory-service.crt'),
    );

    const proto = loadPackageDefinition(
      loadSync(PROTO_PATHS.order, {
        keepCase: true,
        defaults: true,
      }),
    ) as any;

    this.client = new proto.shop.order.v1.OrderService(
      process.env.ORDER_SERVICE_ADDR || 'order-service:50053',
      tls,
      {
        'grpc.ssl_target_name_override': 'order-service',
        'grpc.default_authority': 'order-service',
      },
    );
  }

  onModuleDestroy() {
    this.client.close();
  }

  confirmOrder(
    orderId: string,
    success: boolean,
    insufficientProductIds: string[] = [],
  ): Promise<ConfirmOrderResult> {
    return new Promise((resolve, reject) => {
      this.client.ConfirmOrder(
        {
          order_id: orderId,
          success,
          insufficient_product_ids: insufficientProductIds,
        },
        { deadline: Date.now() + 10000 },
        (error: any, result: any) => {
          if (!error) {
            resolve(result);
            return;
          }
          reject(error);
        },
      );
    });
  }
}