import { describe, test, expect } from 'vitest'
import { analyzeEmailHeaders } from '@/lib/toolbox/email-headers'

const SAMPLE = `Return-Path: <bounce@evil-domain.ru>
Received: from mail-out.example.com (mail-out.example.com [203.0.113.10])
	by mx.destino.pt (Postfix) with ESMTPS id ABC123;
	Mon, 9 Jun 2026 10:00:30 +0000
Received: from smtp.origem.com (smtp.origem.com [198.51.100.5])
	by mail-out.example.com with ESMTP id XYZ789;
	Mon, 9 Jun 2026 10:00:10 +0000
Received: from [192.168.1.50] (unknown [192.168.1.50])
	by smtp.origem.com with ESMTPSA;
	Mon, 9 Jun 2026 10:00:00 +0000
Authentication-Results: mx.destino.pt;
	spf=fail smtp.mailfrom=evil-domain.ru;
	dkim=pass header.d=origem.com;
	dmarc=fail header.from=banco.pt
From: "Banco Seguro" <suporte@banco.pt>
Reply-To: <atacante@evil-domain.ru>
To: vitima@destino.pt
Subject: Atualize os seus dados
Date: Mon, 9 Jun 2026 09:59:58 +0000
Message-ID: <abc123@origem.com>

corpo do email aqui`

describe('analyzeEmailHeaders', () => {
  test('extrai headers básicos', () => {
    const r = analyzeEmailHeaders(SAMPLE)
    expect(r.from).toContain('suporte@banco.pt')
    expect(r.subject).toBe('Atualize os seus dados')
    expect(r.messageId).toBe('<abc123@origem.com>')
    expect(r.to).toBe('vitima@destino.pt')
  })

  test('inverte a cadeia Received para ordem cronológica (origem primeiro)', () => {
    const r = analyzeEmailHeaders(SAMPLE)
    expect(r.received).toHaveLength(3)
    // O primeiro hop cronológico é o último no header (IP privado interno)
    expect(r.received[0].ip).toBe('192.168.1.50')
    expect(r.received[2].by).toContain('mx.destino.pt')
  })

  test('calcula atrasos entre hops', () => {
    const r = analyzeEmailHeaders(SAMPLE)
    // hop 2 (10:00:10) - hop 1 (10:00:00) = 10s
    expect(r.received[1].delaySeconds).toBe(10)
    // hop 3 (10:00:30) - hop 2 (10:00:10) = 20s
    expect(r.received[2].delaySeconds).toBe(20)
  })

  test('identifica IP de origem público (salta IPs privados)', () => {
    const r = analyzeEmailHeaders(SAMPLE)
    expect(r.originIp).toBe('198.51.100.5')
  })

  test('extrai resultados de autenticação', () => {
    const r = analyzeEmailHeaders(SAMPLE)
    expect(r.spf).toBe('fail')
    expect(r.dkim).toBe('pass')
    expect(r.dmarc).toBe('fail')
  })

  test('avisa sobre mismatch From vs Return-Path e Reply-To', () => {
    const r = analyzeEmailHeaders(SAMPLE)
    const joined = r.warnings.join(' ')
    expect(joined).toContain('Return-Path')
    expect(joined).toContain('Reply-To')
    expect(joined).toContain('SPF')
    expect(joined).toContain('DMARC')
  })

  test('texto sem Received produz aviso', () => {
    const r = analyzeEmailHeaders('From: a@b.com\nSubject: x\n\ncorpo')
    expect(r.received).toHaveLength(0)
    expect(r.warnings.some((w) => w.includes('Received'))).toBe(true)
  })

  test('unfolding de headers multi-linha (RFC 5322)', () => {
    const folded = 'Subject: linha um\n continuada na segunda\nFrom: x@y.pt\n\n'
    const r = analyzeEmailHeaders(folded)
    expect(r.subject).toBe('linha um continuada na segunda')
  })

  test('headers depois do corpo são ignorados', () => {
    const raw = 'From: real@dominio.pt\nSubject: real\n\nFrom: falso@corpo.pt'
    const r = analyzeEmailHeaders(raw)
    expect(r.from).toContain('real@dominio.pt')
  })
})
