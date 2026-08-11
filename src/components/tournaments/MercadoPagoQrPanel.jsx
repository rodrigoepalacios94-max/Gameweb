import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatCurrency } from "../../utils/formatters";

export function MercadoPagoQrPanel({ payment }) {
  const [qrImage, setQrImage] = useState("");
  const qrData = payment?.qrData || "";

  useEffect(() => {
    let active = true;
    setQrImage("");
    if (!qrData) return undefined;
    QRCode.toDataURL(qrData, {
      margin: 1,
      width: 220,
      color: {
        dark: "#050607",
        light: "#ffffff",
      },
    })
      .then((value) => {
        if (active) setQrImage(value);
      })
      .catch(() => {
        if (active) setQrImage("");
      });
    return () => {
      active = false;
    };
  }, [qrData]);

  if (!payment) return null;

  return (
    <div className="mp-qr-panel">
      <div>
        <strong>QR dinamico Mercado Pago</strong>
        <span>{formatCurrency(payment.qrAmount || payment.amount || 0)} - 5% menos pagando con QR</span>
        {payment.expiresAt ? <small>Vence: {new Date(payment.expiresAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</small> : null}
      </div>
      {qrImage ? <img src={qrImage} alt="QR dinamico de Mercado Pago" /> : <p className="muted">Generando QR...</p>}
    </div>
  );
}
