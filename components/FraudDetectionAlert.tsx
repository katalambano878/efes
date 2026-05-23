'use client';

interface FraudDetectionAlertProps {
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
  orderId: string;
}

export default function FraudDetectionAlert({ riskLevel, reasons, orderId }: FraudDetectionAlertProps) {
  const getRiskColor = () => {
    switch (riskLevel) {
      case 'low': return 'bg-gray-50 border-gray-200 text-gray-800';
      case 'medium': return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'high': return 'bg-red-50 border-red-200 text-red-800';
    }
  };

  const getRiskIcon = () => {
    switch (riskLevel) {
      case 'low': return 'ri-shield-check-line text-gray-700';
      case 'medium': return 'ri-error-warning-line text-orange-600';
      case 'high': return 'ri-alarm-warning-line text-red-600';
    }
  };

  const getRiskLabel = () => {
    switch (riskLevel) {
      case 'low': return 'Low Risk';
      case 'medium': return 'Medium Risk';
      case 'high': return 'High Risk - Review Required';
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${getRiskColor()}`}>
      <div className="flex items-start gap-3">
        <i className={`${getRiskIcon()} text-xl flex-shrink-0 mt-0.5`}></i>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Fraud Detection: {getRiskLabel()}</h3>
            <span className="text-xs font-medium px-2 py-1 bg-white/50 rounded">
              Order #{orderId}
            </span>
          </div>
          
          {reasons.length > 0 && (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Risk Indicators:</p>
              <ul className="space-y-1">
                {reasons.map((reason, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <i className="ri-arrow-right-s-line flex-shrink-0 mt-0.5"></i>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {riskLevel === 'high' && (
            <div className="mt-3 pt-3 border-t border-red-300">
              <p className="text-sm font-medium mb-2">Recommended Actions:</p>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition-colors whitespace-nowrap">
                  <i className="ri-pause-circle-line mr-1"></i>
                  Hold Order
                </button>
                <button className="px-3 py-1.5 bg-white text-red-800 rounded text-sm font-medium hover:bg-red-100 transition-colors whitespace-nowrap">
                  <i className="ri-customer-service-line mr-1"></i>
                  Contact Customer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
