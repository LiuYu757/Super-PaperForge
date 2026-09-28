import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'PaperForge - Open-Source Collaborative LaTeX Editor';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
            }}
          >
            🔥
          </div>
          <span
            style={{
              fontSize: '56px',
              fontWeight: 800,
              color: '#f8fafc',
              letterSpacing: '-2px',
            }}
          >
            Paper<span style={{ color: '#f97316' }}>Forge</span>
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: '28px',
            color: '#94a3b8',
            marginTop: '0',
            marginBottom: '40px',
            textAlign: 'center',
          }}
        >
          Open-Source Collaborative LaTeX Editor
        </p>

        {/* Feature pills */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {[
            'Real-time Collaboration',
            'PDF Preview',
            'Git Integration',
            'DOCX Export',
            'Self-Hosted',
            'Hosted Pro Plans',
          ].map((feature) => (
            <div
              key={feature}
              style={{
                background: 'rgba(249, 115, 22, 0.15)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                borderRadius: '9999px',
                padding: '8px 20px',
                fontSize: '18px',
                color: '#fb923c',
                fontWeight: 600,
              }}
            >
              {feature}
            </div>
          ))}
        </div>

        {/* URL */}
        <p
          style={{
            position: 'absolute',
            bottom: '32px',
            fontSize: '18px',
            color: '#475569',
          }}
        >
          github.com/LiuYu757/Super-PaperForge
        </p>
      </div>
    ),
    { ...size },
  );
}
