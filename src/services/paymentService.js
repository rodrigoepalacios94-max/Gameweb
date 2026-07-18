export const paymentService = {
  createMockMercadoPagoCheckout(registration) {
    return {
      id: `mock-payment-${registration.id}`,
      provider: "Mercado Pago MOCK",
      status: "ready",
    };
  },
};
