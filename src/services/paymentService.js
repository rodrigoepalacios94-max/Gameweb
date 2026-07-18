export const paymentService = {
  async createMockMercadoPagoCheckout(registration) {
    return {
      id: `mock-payment-${registration.id}`,
      provider: "Mercado Pago MOCK",
      status: "ready",
    };
  },
};
