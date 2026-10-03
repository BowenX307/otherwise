import type { ButtonHTMLAttributes } from 'react';
import './TextButton.css';

// 主操作只用带下划线的文字，没有实心底色
export function TextButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`text-button mono ${className}`} {...props} />;
}
