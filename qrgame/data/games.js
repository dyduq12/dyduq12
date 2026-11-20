// Colecao QR Game: universo de 7 planetas (#01 a #07). v0.2.0.
// url: relativa a pasta qrgame/ (os 2 jogos ativos rodam inteiros a partir do proprio link via loader.html).
// qr: QR Code em SVG (null = ainda nao existe). #02 usa a ponte ./firewall.html no QR porque a URL completa passa de 4.300 caracteres.
// et: indice em ETS (js/sprites.js). steps: legenda cinetica da demo. lore: historia cientifica do planeta e origem do nome do habitante.
export const GAMES = [
  {
    id: '01', code: '#01', name: '2048 Drop', status: 'active', et: 0, planet: 'Kineton',
    kind: 'Puzzle de fusão',
    palette: { primary: '#FF4D4D', secondary: '#FFD23F' },
    demoType: '2048',
    steps: ["Arraste", "Mire", "Solte", "Funda iguais"],
    url: './loader.html#~1MfT3Ys7hqOw(~;Ph|H43,T93LaI/Utl@-E39B;*=)uyk*234(ST:9}5c=idg4nlOF|)74A-=:{dPIn?MPs$wYzHcJa_QE0$oVK]z_rUsdML|XH.@V.S94$]gs--,5;:hpflVfAMvu@iO50,-aD@)Z5-wVvu?UAhnYlEiK-}D5uVA)Plhdlnmfv0|T0P*_O$IZG7s/Zad3a_H+Za|owZtS7e:yL8:B-WTAuznch?bCLJ)-Oo?R8klU-r=,uDCNW:*NCO}F{1Kj.x5++WG~uJTjFWoR8-^f8IjG+^YVYgM^B4QFj|T]2[obve,//HFrRuvx(*InSJj2,w!Ib648q{IqwUV[q-H-cq(Oy_(t)dVvjyYG[J=A1x~tIF|;Oup{uj8:psUSazY)6}qET?j|=BB}yYl|7X@F*HG@[T:F.lLRqH~aml2.tWxsd=VxEI):Rprryl,q}OCUN+jj6058gFeq$)H;5zr/gvLSWrX{;i?S5lqB6VPPG18I|aL=..P*E3du3qm)bU*hCB0uc?+7p8|np8NF}wJ=szu5/U0N+we-i/6r!CDwCe]2[0yz7@!TwLWg625D7)6e{7Jd08c|8r3{[li9By7lO8aNisSViT?QA[5,V$YB+;s{sHTmKB4.Ay-Cu,L7:Q@dYaKMc5j:Gh.Q?qaDTJG$m!_.JHSq1u5?Mgh6o9~(/3Gd[P5g;;QNWzWn-N~EdevA)6;Bl=$NQo;5z*yy0-XKUDjPwvuz6br|n_JH9Pi+W,+$H)=9Vi2(,5Xppoq5E1SnyuIV6Xc)gT)X_JNv.JDwFFUso/E?65(}=sqk2vPsl+VJx3rdDSyGCkr0]?nppeRNQ~VlR~QnlVz!cYBUV=4L_Yv;,+-f/zjX!2ncOUA$h?XK^fh{klQ4=$:FI)F;cManh~{kkEBq3j0Ot)Qrd=,pvSM^?fD9;5Sbcr!W;@R9IL?b}f-xQP-Cn^kSp8qrCaoRlMAnhWm$iCxfgY{wBKmWAmtZpdmm5o_S3D$n=.GuEVL|e!ml:Y;gJiL;d}78RIqgfZkb{o,o3{2FX!KMb14pwrTFA9_2hrXa]WMU]y+,aW2H0]25C5?KYt~Pvhs8R[i2ubrH[oah)wG*RU+RlkCJWY?;vZmTp+0.WTk](N?GpEo(0f;P;7~b~=a)/H1tCyC0]MZG1.Q,og+Fj^$:-2,UJjokcLV:(RW6nnKJ!=@.=^S)j{/vRtf57g!PBL4UYKXVr!=enA=gH2Mj4a{af1_goa=iR7FmTlelUA/S[dV;epXV^*rnVqJ(d,o+x|VBhe(7|)D0Jf@{,u}KzY8z=2E/5rdL,4W?u^4ojAG(7YRSh:IlcRhfuR,S~4s^!/$a_0jepF$0KPEm8WR3][RM)egiC_JrsXuTe=c(_?1|_?$5h2pvUS*t;Mhy)x}!)0dN*J^FCGOC!^S7=iK*9fI!-faMqY{aTf/sZ)UlVNF^*ikq@R3yZsw$I1!Pz.o?0k/.wC@(W7Ky2O2owB1ShV$+y_x-Q+VvZ,Ck0WcBK3CJ+0zJ;qV]Xv;U![W=]1D}5r_u8EYAxb+|owfjei+kxqk33kr5p$W{~bdSqzc;nB(F?^_.6n9y~{HRrwEmX@sv3[qRRQ4*5QTCRhUnO=p?J6V2na?F5,*,/jp*Edv7,Uc,SDUDq.qn]p^Lp^|I+-*$k=G*f!wr:u^^WVQ7ketB+Lr.*Km$39@j;n!@f8xO:y[Y=])?{Y!eu+?+9,LB!~A+2fS9gXs/h$.jap!9Qt11{{U,Nx[1(MTGw4Dszp1.Co:@46g(Pu-LJ6roZbWYDruDh2Ow2~G]EiPvc)8f@LNh[DDhiQ*x*)t7lgBV/,1gT53fl/SisCC94f{Wp21cIrfJHw20x8J5]esJvZ]2|l)z$_UD+oFYbSy0j8!XPipL==v.vf]eW-IFLa0_sQCkGi|Teaq4VAO~ehqX1}CY*,;5$^nhRo=T-]P(F=.;jW-ps}T:qQrs|);~b+,)[sSm1m(pJHHScb]/P~k)zIP5fl-PA.XUJ/dY*;!qCfd(QhYoH7OcECX-WhDvH{u(3oB_OFLg{1G6}5lwM^ep4*YGdw9vYk.b|V2e07(GpL=nqYKk|vvz0^A.tJZptsolghqN~^5yi-9D6u}+{EUv)?:~!bU4~qW92@aw-UZXng2yqr[I0UigUWw)W9uJeDq[ks}r8qWnZW?Jx_^vfeW!(78Zp?16@_/F+7__dwF/3c?-(XG/zS,(05~4+@S8Ma,W2vu}]65N$[Opuxp3GTlvRIyRx_poTkljkA-~?506j]IPg.nlT39dd(|SLnh(FHdD{:=;A!SdmII7tK/{u2.*eb/h$x-8^*+TIB.3sPB.=.CiOK^h7[{vh=JOU@k3s}5bS@SiJ(LMGsb,!ar~]4-P5RR=/Nr;Uf-8S^yrWfxv249{mvSuJeYqiKA~QTlh30fW6($SuNs_FE1h||c!]CsR[ydSiT.dpkAZ@,]RO9gW.UDUXgvMJY:iYUr7VIRV]h5)~e_?}moVm+b)pk3OnommuQUur(ySo]LWdtn-E{*Fy/:$IzMnm4pBfM.aIskl{SpnsPM5IA|AK=DWU7NR{U?H,}Ym{LB|(Yijq~$?s',
    qr: './assets/qr-2048.svg',
    lore: {
      story: "No Planeta Kineton, onde a gravidade esmaga qualquer matéria solta em direção ao núcleo, o Redox nasceu como uma gota densa de energia pura em suspensão. Em vez de se espalhar como água, sua massa elétrica permanece sempre tensa e instável, buscando outras cargas semelhantes para se fundir e multiplicar de volume.",
      origin: "Vem da química, das reações Redox (abreviação de redução-oxidação), o processo real em que átomos transferem elétrons entre si para mudar de estado e liberar energia. Escolhemos esse nome porque a própria existência dele é uma reação em cadeia: cada colisão transfere carga e o transforma em algo maior."
    }
  },
  {
    id: '02', code: '#02', name: 'Firewall Break', status: 'active', et: 1, planet: 'Tecton-IV',
    kind: 'Quebra-blocos híbrido',
    palette: { primary: '#FF5A36', secondary: '#FFD23F' },
    demoType: 'firewall',
    steps: ["Dispare", "Rebate", "Abra túneis"],
    url: './loader.html#~1ZXalqYwDD2yQa+AT[-HW$?f?Z6rpYejucXEJ5jJqqHqt=+C*uU$B7pyo*5;+nG|5tjimL4RO54tnX~H*KkyJgmun5YQ*gziKNOGo6yjrY^!7VM7m19@dPK]P-h?5Hrza0t6p3u?r7z26O3SQE7K]pvjuFkT(-hiq9IhX+h}8PYT)Q(:kLmT@2cWMxzfe!ci/9s///pq230!1wPVi)@{bH.uInH:(7mb,LU;m4zlDKIyi+dDhdGLx4yq52TkUQmDs{^Kh[?XQ*rq.u+Xo7kWTpsABoAzCy:K8wM0956a=-ASN=3?ysqqIVnQGq524|Gq8y?BDI$(uJuP/o9^QZ=gS@}iU]2S$~.a](ly**1~Qhj/.J8daci^mcj:^k(|s+.|z0(e1OMH!~5}bNes=OVZy_N{3OpdnFOj[v].uIv|8.|?:XR:Em8Kl+AOJ2p,$?3aE|n*|r$xd!,FWr6P*E4[Rfy;6L^:,i2L?k@kUkE1oihQ,+VgO5:/aU_;@S(s*TVGKM;|,W;-xX:XB69Z0k@wztZ7GPcs01Wl-0o@3nT:t@TYwS[ql(MJ[;*xYElM=.W[{{I.LV(K@}++;oXOfe32|7h}N.j;sXMrT0B+65T=LaJ7mlB^AJhV02QH2.Cfwu{^lvZ[YHAUaBeMT;vY[$v.4Z:0J^lmyeHLm}:iy@gzI6e.BZ[v?ldM!jGj3,S~Haym:V/mHmc8Dv/,GWh4BBbVn|1V.*9Id^VJ.w_)]{5)![Li){Y[aD9j0Ftdmrg[((lyycedBLKhyv2dn[Za!tc)ee:OWt{4w,olAdOvU+t0hX98!HxfWa=i8.iL+ys5CYR4YAh:7Aq8SlWJZX]t]|48*uC0E{]B^Cb0,.rBU5!fweF:nlCH:Yz6;mGQG}nr~B~Uwd/4+Ub29gnjT5X^pcr$vQgJGtlsjj7z8[8(qrw/j7_EHnh,XDsc?uONH;zagcXXSGfKH!ES6V4k{!oL$BL{3clGn/:J;g-Fw8:AKF},W.ak?TL2~Baj7;e.o.jrWHc;5JMiC::b9C(;7ecc!3t{9~RD],JL!u$Od[j(c1dvDFiR_3khors]4y[){X4GOeDTzk775YGijkQi[wDAE3NI3/(GL+Rg.?iA5HWh?jO]Po6{6$Ad)zt5NA6OgQo6rBH=Za.p_qHv(Y80u~8T=^AfwCC!QGOh)GZ[r3ZnzA(ejgthgjbac(/]I.{~M^mt@~p8E(-1d,e;}/[xY)uF=q,fr26fOFT$JMsIOc=oC[wh)^d5@(=}$IxX4?LGh81W*UvPJY3W}e6aRpC_L2DZFKKl*C)6,FX{/+98)8]gd!]Ig].F4zEd(Ew!=lk!/,2Wo=$WRrZB,uUIQxvq6LbOcSYM@iIKNn;8!MStuBgRO,?GgQmok+VSg_JVLfz]DF7_Q:YT~grj@OIcli5XT$M/@?QIU!HKHKv!9{=O1AL,c1sG(WWchxrO2OM=(Y!-7m(N]4Ji/G{71!lP}*RwuaIv]fgTW)?-GQmB,?FI~jdSG~rdWR+WN?:C@kE4@y(FVIfKdP*1$*$+LQ/8BH!)S7PYOl|LVB@8f_2WGLm^G*do$nXJrAqP=ijU8LiWJ8:K?^:KYMv8JD^=t(oCMi]5kErk=6|lxMySARbwMH_:IR]2A[tFu!:?G|9m_i|UWuXb12:|+g(E.}])oAtj3jlia_b5z.yJaxQ;3^dDUa]N5dGYeM{lAyk)Xq+DGTxaA9vbGi{IQJ2=5Z7PD*Lh@AkT~Q+!C9$i+]E8Ohcq.n]FjIlK8b@)o4nK5XmC^dpP!N+B?{nQqH@zfUouQ@Gw]jOA6*y^/,;k;9*dBk36,0r_bAYincE.ay)ofuo!0yf{2-JEOB1$Oj~!Ef,J*FwWm),cv,U8+RF@J}HK)q~cE30EW8t!5P-gDl+voTQZQI0H4=]x_JxyZ)NpkClIaS8s|hxO[gago[c8gJd,~q?YU$cc:x(J$XUgz3;I31ok,{~JX;XHc1YeTHa-C|Tay*xt,I^yhk^WbZ1nE)p;@/gW^zK}l0^l_,T6A)3-KuMertSYC:_co67jwqkr0]h?^gZh/Vi$)ZBz4OMShsG0Sq+];|Uhl6kWl-X[o,m=!lIR/41L-2D5cew4A(37.u$ioAac59I2YWvrjvflr]o0grau;w4|g_CYLscP*8Q]EDWBE77py?**T(]P)Y+{_hPiYWA;9$oXn5{gdw/5RnbAryWDxUBreaS2E(A=Re;bqSRHp*sG!X7;1HBAVWW(cuyrcVd?w+wq:/LSo^|)xdJM6vije~zG7q@G^sjDez8Z|$^z^g?=,.HipT:=(zf81h3aT9lkJPQNVQ0Mj.A{TIF=zLfon:E2gp-gG!s}$NLP],.[w[NZu1uAQ?@z+jZNw0/ES8MoX_?I/_P6A$OE5*^gx8{?IUl8$2a,z)Jy:o4a2}?0,ijEGyrN|7OF$?I]TNicMbLNDDoaf*!1:[k1eaoi0H?HTi5RA5s6|B@K+thV)vk)g?G)QXo7hb?lAbZU4^+9;6vo/=fTQbBbWoRH2WIV8ec~zz/?oU3*MWPd5U.K4D!)WqE+SK=nA_s(8?Z|!G-G.a^m-)q@.PEcfWvsP,nmW5+N[xSDL]^96/CSK!m5?Rko9)Z8Xalw1m?bfSh|=GIo?w[$-vL*?t;.N$v!|(0dH6X3O08_]~9XkNud:yp/V1Q3iRkdPbX6Pmu]+xo3~C;ScE+]3+q._ERbw?H_w83h;zW,q;}X^4aebx/B04+Lg,L)dY$qLYNJ^S+/@000rzC*N:I=li^re7@iGuLO,o=jvL6wcZNa!1!G_.sDZ~ae5^vPrsX)mAN~DZ27HUjmgEC|tYpY}q]n*7W?z~rOA0GJ)RxJ61ja+Cpts*y5:WWI6U.^.E_1~c83=q$-6YeBG)[oaLXmrue@S@;7$t!nKi0-9+P4.dR.)!*ZVTSckJQf4:{B~]SZHf6^uXJ2k_lrSFC[$FSxYRUOj4e2zb0qtvs*c=lUru|ad3[~1d4u$c0DzPgIOKjhnTYE4mAbA=FUtVG8WeX@0owlCQi7$eo.}/o+uJf(RZBRmscCxQ6Ghc6-OJCw.,M1qTrkvGE_=_1_|)|/B$$gsF,/y3GsjgxX6CreNE25*.}H2j=QM0K(|loDZgFuY0k84rIu6y@7|+K}6r1~V]3w1r2pfcR0){l^CgM(ZO;!HPd4.xlj^]^(JoP:hCfD2uQtcktl2!AvSfqJX)9/Gta?rC+.$}KnBl0-(L(:/8t0rYiaU,-fh^O:ju/jBbF$,YC5wl75pt5R2R_*Fw.Js3K4ki)s,tg]PluU=zUuC(7(ckfc(Jwf}SV1_7:7wqV7yl1J*pYMP$ycfKApG=6C$DAU_DXejVLahmFHd,*u,X$0mt+@=1~k6FDuf|TA/NV*0lUXCU5;H0)Ae/4HBM^[4Ot1nl*KkC:uzgYc1K}Ev_4cfY:yK@5bd,Yn/kN]pNkpv+j?6_tr(3}H]5h1jMkrK?KkRb_Cp~KK}_2@1[=MM3nw{!Q4V5@+uVFhxuo.r=fHBgdJF+Pb7)m17Jq.m/BGwoV[{iA4hjKKAv?p-r4@;v5@7W}NUaJS(TlmFZ]GwqP1*_yh[}8|q)?sZuqKFydGjSE(2:I=fpFx/$KB~.a?;yZly}A:B[Q8N^yl_.FLZ?K5886KE+qqSnlHaN.S}.xsNx.UL*h|)-~LHwj@N40M;I_*{w-xGs~34B0;vx-JGTnCw!uF=y*Cy-l|]5n4/2a${V-/AtOCGyapkk*s7gx0yvPiOu2v?BhB:ts/mt}Vxxs/gUSYc9nel]hL)ds-aoF?W]ML?R^dy[2!~.VgjI}1=RY~r^a~pQ5+=zUs[A_S{NprHdOLIS!K,:i5ax@g0x=47o:-XnHK9a0OEkboInEP/oeoFQ_PiHpY/D[QN.}i;()u4bfV,pMV0DPDS@M@)CI6:/tQlgu.h+**dyU;P(csX8f?q93eQSl8LPj=?8?O@ZCJt?V+pKqxsQ?p3-c7B{vKB3.FaSsn[!PI-9QvbM0[8T/o)Gj~SP?85g1l]}K:JzzFZ9/jVr2q~+OdzEafIoP12GvABRBF|gxo,H=M@EYhwtda}ZWq@M+O8LxzZJ-bt=;|FuqEN)ME/dxrm0~fL}{/F;QyE$7[9N*{z2c6uv8E/p:]V{yX_=FPcTDBE=AtCrX,2vvJ{EocS{G}fDH-8GpIos0|@!h:/ikky^2b4wNKLpf|Iy$$fX4?[8;g5.2mNA2PhNoSI)MK|.+KU/H(VN?1M.Gh!!E!01BCyz8cP@_]@i(;4D}jbJ)+/[6/yCE?IHYr3)@LtWRYsUphtfRj+$?0}}BHWH).qV=W+_99V!yhLSKY:F:dsuQ_~([tAj~R.FFoyg?W=mD74|',
    qr: './assets/qr-firewall.svg',
    lore: {
      story: "No Planeta Tecton-IV, placas gigantescas de rocha cristalina deslizam umas contra as outras sob pressão extrema, gerando tempestades constantes de faíscas. O Krakel surgiu do atrito seco dessas colisões: uma centelha de plasma que ganhou consciência no exato milissegundo em que a crosta do planeta rachou.",
      origin: "Nasce da mecânica da fratura na física dos materiais — unindo o termo crack (fissura) e a emissão acústica do estalo seco que um sólido rígido emite antes de quebrar sob tensão, fundidos com a ideia de pixel. Ele carrega esse nome por ser a própria fagulha capaz de trincar qualquer barreira."
    }
  },
  {
    id: '03', code: '#03', name: 'Neon Drift', status: 'soon', label: 'Em breve', et: 2, planet: 'Hadrôn',
    palette: { primary: '#2EE59D', secondary: '#38BDF8' },
    demoType: null, steps: null, url: null, qr: null,
    lore: {
      story: "No Planeta Hadrôn, onde tempestades cinéticas bombardeiam a superfície sem trégua, sobrou uma criatura de elasticidade absoluta que nunca se parte com o impacto. O Glúon absorve qualquer pancada, estica seu corpo gelatinoso e desliza pelas curvas do terreno deixando um rastro verde fosforescente no escuro.",
      origin: "Vem direto da física de partículas: o glúon (do inglês glue, cola) é a partícula subatômica real responsável pela força nuclear forte, a energia que mantém os quarks 'colados' dentro do núcleo dos átomos. Escolhemos esse nome porque uma criatura elástica e aderente traduz perfeitamente a força que mantém a matéria unida sob pressão."
    }
  },
  {
    id: '04', code: '#04', name: 'Pixel Hive', status: 'soon', label: 'Em breve', et: 3, planet: 'Umbra-V',
    palette: { primary: '#38BDF8', secondary: '#2EE59D' },
    demoType: null, steps: null, url: null, qr: null,
    lore: {
      story: "Nas cavernas silenciosas do Planeta Umbra-V, onde a luz das estrelas nunca alcança, crescem organismos bioluminescentes que se comunicam por pulsos de rádio. O chapéu ciano do Sporak funciona como uma antena parabólica viva que capta sinais fracos perdidos no espaço e os espalha por filamentos subterrâneos.",
      origin: "Mistura esporo — a microcélula resistente que os fungos lançam no ar para sobreviver em ambientes extremos — com a biologia das redes miceliais e rizomas, as teias ocultas que interligam florestas inteiras como uma internet orgânica. Ele recebeu esse nome porque transporta dados compactados como esporos e conecta todo o ecossistema em rede."
    }
  },
  {
    id: '05', code: '#05', name: 'Turbo Orbit', status: 'soon', label: 'Em breve', et: 4, planet: 'Vértice-7',
    palette: { primary: '#3B82F6', secondary: '#38BDF8' },
    demoType: null, steps: null, url: null, qr: null,
    lore: {
      story: "No Planeta Vértice-7, um mundo congelado de pressão zero onde nenhuma atmosfera suaviza as formas, a matéria se organiza em ângulos matemáticos perfeitos. O Arest nasceu quando correntes magnéticas cristalizaram em um losango flutuante que gira como um giroscópio para estabilizar a própria órbita.",
      origin: "Vem da geometria espacial, da palavra aresta — a linha reta onde duas faces de um poliedro se encontram e definem a estrutura de um sólido. Escolhemos esse nome porque, numa grade de 8×8 pixels sem curvas suaves, são justamente as arestas e os cortes em 45 graus que dão identidade e precisão ao personagem."
    }
  },
  {
    id: '06', code: '#06', name: 'Glitch Garden', status: 'soon', label: 'Em breve', et: 5, planet: 'Entropia',
    palette: { primary: '#F4F1EA', secondary: '#2EE59D' },
    demoType: null, steps: null, url: null, qr: null,
    lore: {
      story: "Na fronteira instável do Planeta Entropia, onde a matéria e os sinais de rádio se desfazem em ruído estático, nem tudo desaparece por completo. O Nulox surgiu como o eco persistente de partículas apagadas — uma anomalia brilhante que se recusou a sumir e aprendeu a moldar falhas no próprio ambiente.",
      origin: "Nasce da ciência da computação, combinando o conceito de NULL (o valor nulo que representa a ausência intencional de dado ou um endereço de memória vazio) com a entropia da informação, o grau de desordem gerado quando dados são comprimidos ao limite. Ele carrega esse nome por ser literalmente o vazio de memória que ganhou forma própria."
    }
  },
  {
    id: '07', code: '#07', name: 'Void Runner', status: 'soon', label: 'Em breve', et: 6, planet: 'Horizonte-07',
    palette: { primary: '#FFD23F', secondary: '#FF5A36' },
    demoType: null, steps: null, url: null, qr: null,
    lore: {
      story: "Na borda mais distante do sistema, no Planeta Horizonte-07, a escuridão do espaço profundo engole quase toda a radiação ao redor. Ali habita o Vesper, um núcleo dourado hiperdenso que concentra luz própria e funciona como um farol gravitacional para guiar qualquer viajante que cruza o limite do mapa.",
      origin: "Vem da astronomia clássica: Vésper (do latim Vesper, estrela do crepúsculo) é como os astrônomos antigos chamavam o astro mais brilhante visível no horizonte logo após o pôr do sol — hoje identificado como o planeta Vênus refletindo a luz solar com intensidade máxima. Escolhemos esse nome porque ele representa o ponto mais luminoso e distante do firmamento, fechando a constelação dos sete mundos."
    }
  }
];
