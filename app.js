const { createApp, ref, computed, watch, onMounted, onUnmounted } = Vue;

createApp({
  setup() {
    const STORAGE_KEY = 'ba_wanted_shop_plan_v9';

    // 基準年月 (アプリ内の「今月」設定。初期値: 2026年10月)
    const baseYear = ref(2026);
    const baseMonth = ref(10);

    const currentYear = computed(() => baseYear.value);
    const currentMonth = computed(() => baseMonth.value);

    // 表示月のオフセット (0: 今月・翌月・翌々月)
    const displayMonthOffset = ref(0);

    // ユーザー設定状態
    const currentCoins = ref(1800);
    const hasMonthly = ref(false);      // マンスリー (+6枚/日)
    const hasMonthlyHalf = ref(false);  // マンスリー（ハーフ） (+3枚/日)
    const hideUnreleased = ref(true);   // 未追加生徒を非表示 (初期チェックON)

    // 開始日付 (月・日): 初回起動時はその月の1日 (10/1)
    const startMonth = ref(baseMonth.value);
    const startDay = ref(1);

    // 選択された月の日数 (1〜12月)
    const daysInSelectedMonth = computed(() => {
      const m = startMonth.value || baseMonth.value;
      return new Date(baseYear.value, m, 0).getDate();
    });

    // startMonthが変更された際、startDayがその月の最大日数を超えていれば自動補正
    watch(daysInSelectedMonth, (maxDays) => {
      if ((startDay.value || 1) > maxDays) {
        startDay.value = maxDays;
      }
    });

    // 当月の総日数
    const daysInCurrentMonth = computed(() => new Date(baseYear.value, baseMonth.value, 0).getDate());

    // 今月の有効日数 (日割り計算: 10月1日なら31日分、10月2日なら30日分)
    const currentMonthEffectiveDays = computed(() => {
      if (startMonth.value === baseMonth.value) {
        const day = Math.min(daysInCurrentMonth.value, Math.max(1, startDay.value || 1));
        return Math.max(1, daysInCurrentMonth.value - day + 1);
      }
      return daysInCurrentMonth.value;
    });

    // 一括設定メニュー開閉状態 (Vueバックドロップにより確実に開閉)
    const isBatchMenuOpen = ref(false);
    const toggleBatchMenu = () => {
      isBatchMenuOpen.value = !isBatchMenuOpen.value;
    };
    const closeBatchMenu = () => {
      isBatchMenuOpen.value = false;
    };

    // 表示モード: 'auto' (幅に応じて自動), 'pc' (強制PC表示), 'mobile' (強制スマホ表示)
    const viewMode = ref('auto');
    const windowWidth = ref(window.innerWidth);

    const onResize = () => {
      windowWidth.value = window.innerWidth;
    };

    onMounted(() => {
      window.addEventListener('resize', onResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', onResize);
    });

    const isMobileView = computed(() => {
      if (viewMode.value === 'mobile') return true;
      if (viewMode.value === 'pc') return false;
      return windowWidth.value < 768; // 768px未満はスマホ表示
    });

    // ソート・フィルター状態
    const sortKey = ref('releaseDate_asc');
    const filterRole = ref('ALL');
    const filterAttack = ref('ALL');
    const filterStatus = ref('ALL');
    const searchQuery = ref('');

    // 生徒マスター
    const rawMaster = window.STUDENTS_MASTER || [];
    const gradeDefs = window.GRADE_DEFINITIONS || [];

    // 生徒リスト初期化
    // 要件: ハスミ（体操服）はデフォルトで現在・目標とも固有4 (grade: 7)
    // 要件: 初期状態では必要文字数は「-」とし、要文字数・必要コイン数には含めない(isEdited: false)
    const initStudent = (s) => {
      const isHasumiGym = s.name === "ハスミ（体操服）";
      return {
        ...s,
        currentGrade: isHasumiGym ? 7 : 0,    // ハスミ(体操服)は固有4
        currentPieces: 0,
        targetGrade: isHasumiGym ? 7 : 4,     // ハスミ(体操服)は固有4
        extraPieces: 0,                       // 今月分のみ別途入手文字数 (ドロップ等)
        buyPlans: {},
        isPinned: false,
        isEdited: false                       // 初期状態は未編集
      };
    };

    const students = ref(rawMaster.map(initStudent));

    // 1日あたりのコイン獲得量
    const dailyCoins = computed(() => {
      let tickets = 6;
      if (hasMonthly.value) tickets += 6;
      if (hasMonthlyHalf.value) tickets += 3;
      return tickets * 10;
    });

    // 30日換算の参考入手量表記 (参考値なので日割りに依らず固定)
    const monthlyRateText = computed(() => {
      const daily = dailyCoins.value;
      return `1日${daily}ｘ30日＝`;
    });

    const monthlyRateValue = computed(() => {
      return (dailyCoins.value * 30).toLocaleString();
    });

    // 年月文字列ヘルパー
    const toYmKey = (year, month) => {
      return `${year}-${String(month).padStart(2, '0')}`;
    };

    // オフセット付き年月取得ヘルパー (今月の場合は日割り日数を反映)
    const getYmByOffset = (offset) => {
      const d = new Date(baseYear.value, baseMonth.value - 1 + offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const daysInMonth = new Date(year, month, 0).getDate();
      const isCurrent = (year === baseYear.value && month === baseMonth.value);
      const days = isCurrent ? currentMonthEffectiveDays.value : daysInMonth;
      const isProrated = isCurrent && (startMonth.value === baseMonth.value && (startDay.value || 1) > 1);
      const daysText = isProrated ? `${days}日 (日割)` : `${days}日`;

      return {
        year,
        month,
        key: toYmKey(year, month),
        days,
        rawDays: daysInMonth,
        isCurrent,
        isProrated,
        daysText
      };
    };

    // 表示する3ヶ月
    const displayMonths = computed(() => {
      return [
        getYmByOffset(displayMonthOffset.value),
        getYmByOffset(displayMonthOffset.value + 1),
        getYmByOffset(displayMonthOffset.value + 2)
      ];
    });

    // 過去データがある最古のオフセット (なければ 0)
    const oldestOffset = computed(() => {
      const currentKey = toYmKey(baseYear.value, baseMonth.value);
      let minOff = 0;
      students.value.forEach(s => {
        if (s.buyPlans) {
          Object.keys(s.buyPlans).forEach(k => {
            if (k < currentKey && (s.buyPlans[k] || 0) > 0) {
              const [y, m] = k.split('-').map(Number);
              const off = (y - baseYear.value) * 12 + (m - baseMonth.value);
              if (off < minOff) minOff = off;
            }
          });
        }
      });
      return minOff;
    });

    // 未来データがある最遠のオフセット (なければ 0)
    const furthestOffset = computed(() => {
      const currentKey = toYmKey(baseYear.value, baseMonth.value);
      let maxOff = 0;
      students.value.forEach(s => {
        if (s.buyPlans) {
          Object.keys(s.buyPlans).forEach(k => {
            if (k > currentKey && (s.buyPlans[k] || 0) > 0) {
              const [y, m] = k.split('-').map(Number);
              const off = (y - baseYear.value) * 12 + (m - baseMonth.value);
              if (off > maxOff) maxOff = off;
            }
          });
        }
      });
      return maxOff;
    });

    // 過去データの有無
    const hasPastData = computed(() => oldestOffset.value < 0);

    // 生徒側・テーブル側の進める・戻れる判定
    const canGoPrev = computed(() => {
      if (displayMonthOffset.value > 0) return true;
      return hasPastData.value && displayMonthOffset.value > oldestOffset.value;
    });

    const maxFutureOffset = computed(() => Math.max(12, furthestOffset.value));
    const canGoNext = computed(() => {
      return displayMonthOffset.value < maxFutureOffset.value;
    });

    // 集計カードの進める・戻れる判定
    // 要件: 翌々月の後の月のデータが入っている場合には▶がアクティブになり閲覧が可能になる
    const canGoNextSummary = computed(() => {
      if (displayMonthOffset.value < 0) return true;
      return furthestOffset.value > (displayMonthOffset.value + 2);
    });

    // シェイクアニメーション用フラグ
    const isShakingPrev = ref(false);
    const isShakingNext = ref(false);

    const triggerShakePrev = () => {
      isShakingPrev.value = true;
      setTimeout(() => {
        isShakingPrev.value = false;
      }, 450);
    };

    const triggerShakeNext = () => {
      isShakingNext.value = true;
      setTimeout(() => {
        isShakingNext.value = false;
      }, 450);
    };

    // 月ナビゲーション (生徒・テーブル・全連動)
    const prevMonth = () => {
      if (!canGoPrev.value) {
        triggerShakePrev();
        return;
      }
      displayMonthOffset.value -= 1;
    };

    const nextMonth = () => {
      if (!canGoNext.value) {
        triggerShakeNext();
        return;
      }
      displayMonthOffset.value += 1;
    };

    // 集計カード用の進む操作 (未来データがない場合はシェイク)
    const nextMonthSummary = () => {
      if (!canGoNextSummary.value) {
        triggerShakeNext();
        return;
      }
      displayMonthOffset.value += 1;
    };

    const resetToCurrentMonth = () => {
      displayMonthOffset.value = 0;
    };

    // ピン留めトグル
    const togglePin = (student) => {
      student.isPinned = !student.isPinned;
    };

    // 純粋な星上げ計算上の必要文字数 (目標 - 現在 - 所持 - 今月別途入手)
    const getRawRequiredPieces = (student) => {
      if (student.currentGrade >= 7) return 0; // 固有4到達済み
      if (student.targetGrade <= student.currentGrade) return 0;

      const targetCum = gradeDefs[student.targetGrade]?.cumPieces || 0;
      const currentCum = gradeDefs[student.currentGrade]?.cumPieces || 0;
      const neededBase = targetCum - currentCum;
      const extra = student.extraPieces || 0;
      return Math.max(0, neededBase - (student.currentPieces || 0) - extra);
    };

    // 集計用必要文字数 (要件: 未追加生徒、および初期状態・未編集の生徒は0として全体集計から除外)
    const getRequiredPieces = (student) => {
      if (student.isUnreleased) return 0; // 未追加生徒はコイン購入対象外のため集計に含めない
      if (!student.isEdited) return 0;
      return getRawRequiredPieces(student);
    };

    // 生徒テーブル・カード用の必要文字数表示 (未追加なら'-', 未編集なら'-', 固有4/満了なら'達成済', その他は数値)
    const getRequiredPiecesDisplay = (student) => {
      if (student.isUnreleased) return '-';
      if (!student.isEdited) return '-';
      if (student.currentGrade >= 7) return '達成済';
      const raw = getRawRequiredPieces(student);
      if (raw <= 0) return '達成済';
      return raw.toLocaleString();
    };

    const isMaxed = (student) => {
      return student.currentGrade >= 7;
    };

    // 指定月(targetYm)までの全購入累計文字数を取得 (過去月すべてを含む)
    const getCumulativeBuyUpToYm = (student, targetYm) => {
      if (!student.buyPlans) return 0;
      let sum = 0;
      Object.keys(student.buyPlans).forEach(k => {
        if (k <= targetYm) {
          sum += (student.buyPlans[k] || 0);
        }
      });
      return sum;
    };

    // 指定月(targetYm)より前(未満)の全購入累計文字数を取得
    const getCumulativeBuyBeforeYm = (student, targetYm) => {
      if (!student.buyPlans) return 0;
      let sum = 0;
      Object.keys(student.buyPlans).forEach(k => {
        if (k < targetYm) {
          sum += (student.buyPlans[k] || 0);
        }
      });
      return sum;
    };

    // 指定月までの購入累計と残り文字数計算 (集計用: 未追加生徒・未編集生徒は0)
    // 画面の表示オフセットに関わらず、過去の全購入を反映して正確に計算
    const getRemainingAfterMonthIndex = (student, monthIndex) => {
      if (student.isUnreleased) return 0; // 未追加生徒は集計除外
      if (!student.isEdited) return 0;
      const totalNeeded = getRawRequiredPieces(student);
      if (totalNeeded <= 0) return 0;

      const targetYm = displayMonths.value[monthIndex].key;
      const boughtUpToTarget = getCumulativeBuyUpToYm(student, targetYm);
      return Math.max(0, totalNeeded - boughtUpToTarget);
    };

    // 各月の残り文字数表示 (要件: 未追加なら'(-)', 未編集なら'(残-)', 固有4なら'(-)', 達成なら'(済)', その他は'(残XX)')
    const getRemainingPiecesDisplay = (student, monthIndex) => {
      if (student.isUnreleased) return '(-)';
      if (!student.isEdited) return '(残-)';
      if (isMaxed(student)) return '(-)';
      const rawNeeded = getRawRequiredPieces(student);
      if (rawNeeded <= 0) return '(-)';

      const targetYm = displayMonths.value[monthIndex].key;
      const boughtUpToTarget = getCumulativeBuyUpToYm(student, targetYm);
      const rem = Math.max(0, rawNeeded - boughtUpToTarget);
      if (rem <= 0) return '(済)';
      return `(残${rem})`;
    };

    // 各月終了時点の目標達成進捗ゲージ割合（目標とする固有・星に必要な文字数（☆1からの累計）を分母として計算）
    const getGaugePercent = (student, monthIndex) => {
      if (student.isUnreleased || !student.isEdited) return 0;
      if (isMaxed(student)) return 100;

      // 分母: 目標の星に必要な☆1からの累計文字数 (例: 固有1なら330、固有4なら830)
      const targetCum = gradeDefs[student.targetGrade]?.cumPieces || 0;
      if (targetCum <= 0) return 100;

      const rem = getRemainingAfterMonthIndex(student, monthIndex);
      if (rem <= 0) return 100;

      // 分子: その月終了時点での☆1からの累計文字数 (目標累計 - 残り必要数)
      const currentCumTotal = Math.max(0, targetCum - rem);
      return Math.min(100, Math.max(0, Math.round((currentCumTotal / targetCum) * 100)));
    };

    // 購入可能判定 (過去月の購入も加味して上限判定)
    const canBuyMoreInMonth = (student, monthIndex) => {
      if (student.isUnreleased) return false;
      if (isMaxed(student)) return false;

      const totalNeeded = getRawRequiredPieces(student);
      if (totalNeeded <= 0) return false;

      const currentYm = displayMonths.value[monthIndex].key;
      const boughtBefore = getCumulativeBuyBeforeYm(student, currentYm);
      const remBefore = Math.max(0, totalNeeded - boughtBefore);
      if (remBefore <= 0) return false;

      const currentBuy = student.buyPlans?.[currentYm] || 0;
      if (currentBuy >= 80) return false;
      if (currentBuy >= remBefore) return false;

      return true;
    };

    // 購入数増減 (未追加生徒は編集不可)
    const increaseBuy = (student, monthIndex) => {
      if (student.isUnreleased) return;
      student.isEdited = true;
      const ym = displayMonths.value[monthIndex].key;
      const current = student.buyPlans?.[ym] || 0;

      if (current < 80 && canBuyMoreInMonth(student, monthIndex)) {
        student.buyPlans = {
          ...(student.buyPlans || {}),
          [ym]: Math.min(80, current + 5)
        };
      }
    };

    const decreaseBuy = (student, monthIndex) => {
      if (student.isUnreleased) return;
      student.isEdited = true;
      const ym = displayMonths.value[monthIndex].key;
      const current = student.buyPlans?.[ym] || 0;

      if (current > 0) {
        student.buyPlans = {
          ...(student.buyPlans || {}),
          [ym]: Math.max(0, current - 5)
        };
      }
    };

    const getBuyCount = (student, monthIndex) => {
      if (student.isUnreleased) return 0;
      const ym = displayMonths.value[monthIndex].key;
      return student.buyPlans?.[ym] || 0;
    };

    // シークバー・所持数変更時 (isEdited = true にする)
    const onCurrentGradeChange = (student) => {
      student.isEdited = true;
      if (student.currentGrade > student.targetGrade) {
        student.targetGrade = student.currentGrade;
      }
    };

    const onTargetGradeChange = (student) => {
      student.isEdited = true;
      if (student.targetGrade < student.currentGrade) {
        student.currentGrade = student.targetGrade;
      }
    };

    const onCurrentPiecesChange = (student) => {
      student.isEdited = true;
      if (student.currentPieces == null || student.currentPieces < 0) {
        student.currentPieces = 0;
      }
    };

    // 別途入手文字数変更時 (超過分の未来月購入予定を自動減算して買いすぎ防止)
    const onExtraPiecesChange = (student) => {
      student.isEdited = true;
      if (student.extraPieces == null || student.extraPieces < 0) {
        student.extraPieces = 0;
      }

      const targetCum = gradeDefs[student.targetGrade]?.cumPieces || 0;
      const currentCum = gradeDefs[student.currentGrade]?.cumPieces || 0;
      const neededBase = Math.max(0, targetCum - currentCum - (student.currentPieces || 0));
      const maxAllowedBuy = Math.max(0, neededBase - student.extraPieces);

      const currentTotalBuy = Object.values(student.buyPlans || {}).reduce((sum, v) => sum + (v || 0), 0);

      if (currentTotalBuy > maxAllowedBuy) {
        let toReduce = currentTotalBuy - maxAllowedBuy;
        const newPlans = { ...(student.buyPlans || {}) };
        const sortedKeys = Object.keys(newPlans)
          .filter(k => (newPlans[k] || 0) > 0)
          .sort()
          .reverse();

        for (const k of sortedKeys) {
          if (toReduce <= 0) break;
          const current = newPlans[k] || 0;
          const deduct = Math.min(current, toReduce);
          newPlans[k] -= deduct;
          toReduce -= deduct;
        }
        student.buyPlans = newPlans;
      }
    };

    const onStudentEdit = (student) => {
      student.isEdited = true;
    };

    // 【要件追加】：必要文字数の全生徒合計 ＆ 購入に必要なコイン数(文字数x10)
    const totalRequiredPieces = computed(() => {
      return students.value.reduce((sum, s) => sum + getRequiredPieces(s), 0);
    });

    const totalRequiredCoins = computed(() => {
      return totalRequiredPieces.value * 10;
    });

    // オフセット指定でその月の収支を計算するヘルパー
    const getMonthNetByOffset = (off) => {
      const ymInfo = getYmByOffset(off);
      const ym = ymInfo.key;
      const income = dailyCoins.value * ymInfo.days;
      const totalPieces = students.value.reduce((sum, s) => {
        if (s.isUnreleased) return sum;
        return sum + (s.buyPlans?.[ym] || 0);
      }, 0);
      const expense = totalPieces * 10;
      return income - expense;
    };

    // 指定オフセットの月が始まる時点（月初）の残高を計算 (過去月・未来月対応)
    const getStartingBalanceForOffset = (targetOffset) => {
      let bal = currentCoins.value || 0;
      if (targetOffset > 0) {
        for (let i = 0; i < targetOffset; i++) {
          bal += getMonthNetByOffset(i);
        }
      } else if (targetOffset < 0) {
        for (let i = 0; i > targetOffset; i--) {
          bal -= getMonthNetByOffset(i - 1);
        }
      }
      return bal;
    };

    // 3ヶ月収支集計 ＆ 各月の必要コイン残
    const monthsSummary = computed(() => {
      const list = [];
      let prevBalance = getStartingBalanceForOffset(displayMonthOffset.value);

      displayMonths.value.forEach((mInfo, idx) => {
        const ym = mInfo.key;
        const income = dailyCoins.value * mInfo.days;

        const totalPieces = students.value.reduce((sum, s) => {
          if (s.isUnreleased) return sum;
          return sum + (s.buyPlans?.[ym] || 0);
        }, 0);

        const expense = totalPieces * 10;
        const net = income - expense;
        const balance = prevBalance + net;

        // 【要件追加】：その月終了後の全生徒の「必要コインの残」 (残り文字数 x 10)
        const remainingNeededPieces = students.value.reduce((sum, s) => {
          return sum + getRemainingAfterMonthIndex(s, idx);
        }, 0);
        const remainingNeededCoins = remainingNeededPieces * 10;

        list.push({
          ...mInfo,
          displayIndex: idx,
          label: idx === 0 && displayMonthOffset.value === 0 ? '今月' :
                 idx === 1 && displayMonthOffset.value === 0 ? '翌月' :
                 idx === 2 && displayMonthOffset.value === 0 ? '翌々月' :
                 `${mInfo.month}月`,
          income,
          expense,
          totalPieces,
          net,
          balance,
          remainingNeededCoins
        });

        prevBalance = balance;
      });

      return list;
    });

    const unreleasedCount = computed(() => {
      return students.value.filter(s => s.isUnreleased).length;
    });

    // 表記ヘルパー (☆1〜4, 固有1〜4)
    const getCompactGradeText = (gradeIndex) => {
      if (gradeIndex <= 3) {
        return `☆${gradeIndex + 1}`;
      } else {
        return `固有${gradeIndex - 3}`;
      }
    };

    const formatNumber = (num) => {
      return (num || 0).toLocaleString();
    };

    const formattedCurrentCoins = computed({
      get() {
        return (currentCoins.value || 0).toLocaleString();
      },
      set(val) {
        const cleaned = String(val).replace(/[^0-9]/g, '');
        currentCoins.value = cleaned ? parseInt(cleaned, 10) : 0;
      }
    });

    const onImageError = (event, student) => {
      if (student.wikiIcon && event.target.src !== student.wikiIcon) {
        event.target.src = student.wikiIcon;
      }
    };

    // フィルタリング＆ソート
    const filteredStudents = computed(() => {
      let list = [...students.value];

      if (hideUnreleased.value) {
        list = list.filter(s => !s.isUnreleased);
      }

      if (filterRole.value !== 'ALL') {
        list = list.filter(s => s.role === filterRole.value);
      }

      if (filterAttack.value !== 'ALL') {
        list = list.filter(s => s.attack === filterAttack.value);
      }

      if (filterStatus.value === 'UNFINISHED') {
        list = list.filter(s => getRequiredPieces(s) > 0);
      } else if (filterStatus.value === 'HAS_BUY') {
        const ym0 = displayMonths.value[0].key;
        list = list.filter(s => (s.buyPlans?.[ym0] || 0) > 0);
      }

      if (searchQuery.value.trim()) {
        const q = searchQuery.value.trim().toLowerCase();
        list = list.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.event.toLowerCase().includes(q) ||
          s.class.toLowerCase().includes(q)
        );
      }

      const ym0 = displayMonths.value[0].key;
      list.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }

        switch (sortKey.value) {
          case 'releaseDate_asc':
            return a.releaseDate.localeCompare(b.releaseDate);
          case 'releaseDate_desc':
            return b.releaseDate.localeCompare(a.releaseDate);
          case 'name_asc':
            return a.name.localeCompare(b.name, 'ja');
          case 'needed_desc':
            return getRequiredPieces(b) - getRequiredPieces(a);
          case 'needed_asc':
            return getRequiredPieces(a) - getRequiredPieces(b);
          case 'buyM1_desc':
            return (b.buyPlans?.[ym0] || 0) - (a.buyPlans?.[ym0] || 0);
          default:
            return a.id - b.id;
        }
      });

      return list;
    });

    // 【要件追加】：一括max購入処理
    // fromMonthOffset: 0 (今月からmax購入処理), 1 (翌月からmax購入処理)
    const applyMaxBuy = (fromMonthOffset = 0) => {
      const currentKey = toYmKey(baseYear.value, baseMonth.value);

      students.value.forEach(student => {
        // 未追加生徒・未編集生徒は除外
        if (student.isUnreleased || !student.isEdited) return;

        const totalNeeded = getRawRequiredPieces(student);
        if (totalNeeded <= 0) return;

        const newPlans = {};
        // 過去月の購入データを保持
        if (student.buyPlans) {
          Object.keys(student.buyPlans).forEach(k => {
            if (k < currentKey) {
              newPlans[k] = student.buyPlans[k];
            }
          });
        }

        // 過去月購入累計
        let pastBought = 0;
        Object.keys(newPlans).forEach(k => {
          pastBought += (newPlans[k] || 0);
        });

        let remaining = Math.max(0, totalNeeded - pastBought);

        if (fromMonthOffset === 1) {
          // 翌月からmax購入: 今月(offset=0)の購入数は維持
          const currentBuy = student.buyPlans?.[currentKey] || 0;
          newPlans[currentKey] = currentBuy;
          remaining = Math.max(0, remaining - currentBuy);
        }

        // fromMonthOffset から順に各月に最大80個ずつ割り振る
        let off = fromMonthOffset;
        while (remaining > 0 && off < 60) {
          const ymInfo = getYmByOffset(off);
          const buy = Math.min(80, remaining);
          newPlans[ymInfo.key] = buy;
          remaining -= buy;
          off++;
        }

        student.buyPlans = newPlans;
      });

      closeBatchMenu();
    };

    const clearAllBuys = () => {
      students.value.forEach(s => {
        s.buyPlans = {};
      });
      closeBatchMenu();
    };

    const setAllTarget = (gradeIndex) => {
      students.value.forEach(s => {
        s.targetGrade = Math.max(s.currentGrade, gradeIndex);
        s.isEdited = true;
      });
      closeBatchMenu();
    };

    const clearCurrentMonthBuys = () => {
      const ym0 = displayMonths.value[0].key;
      students.value.forEach(s => {
        if (s.buyPlans) {
          s.buyPlans[ym0] = 0;
        }
      });
      closeBatchMenu();
    };

    const confirmReset = () => {
      if (confirm('すべての入力（所持コイン、星上げ目標、購入計画、ピン留め）を初期化しますか？')) {
        localStorage.removeItem(STORAGE_KEY);
        currentCoins.value = 1800;
        hasMonthly.value = false;
        hasMonthlyHalf.value = false;
        hideUnreleased.value = true;
        startMonth.value = baseMonth.value;
        startDay.value = 1;
        sortKey.value = 'releaseDate_asc';
        filterRole.value = 'ALL';
        filterAttack.value = 'ALL';
        filterStatus.value = 'ALL';
        searchQuery.value = '';
        displayMonthOffset.value = 0;

        students.value = rawMaster.map(initStudent);
      }
      closeBatchMenu();
    };

    // 端末の現在日時取得ヘルパー
    const getRealToday = () => {
      const now = new Date();
      return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate()
      };
    };

    // 自動ランクアップ（星上げ）計算ヘルパー
    const calculateRankUp = (currentGrade, currentPieces, addedPieces) => {
      const currentCum = gradeDefs[currentGrade]?.cumPieces || 0;
      let totalPieces = currentCum + (currentPieces || 0) + (addedPieces || 0);

      let newGrade = currentGrade;
      for (let g = 7; g >= 0; g--) {
        if (totalPieces >= (gradeDefs[g]?.cumPieces || 0)) {
          newGrade = g;
          break;
        }
      }

      const newGradeCum = gradeDefs[newGrade]?.cumPieces || 0;
      const newPieces = totalPieces - newGradeCum;

      return {
        newGrade,
        newPieces,
        isRankedUp: newGrade > currentGrade
      };
    };

    // 繰越モーダル状態
    const isRolloverModalOpen = ref(false);

    // 一括設定から「次月へ繰越処理」をクリックした時のハンドラ
    const openRolloverModal = () => {
      closeBatchMenu();
      isRolloverModalOpen.value = true;
    };

    const closeRolloverModal = () => {
      isRolloverModalOpen.value = false;
    };

    // 繰越プレビューデータ
    const rolloverPreview = computed(() => {
      const fromYear = baseYear.value;
      const fromMonth = baseMonth.value;
      const toYear = fromMonth === 12 ? fromYear + 1 : fromYear;
      const toMonth = fromMonth === 12 ? 1 : fromMonth + 1;

      // 繰越後の所持コイン (前月末残高を引き継ぎ、マイナスなら0)
      const carriedCoins = Math.max(0, monthsSummary.value[0]?.balance || 0);

      const real = getRealToday();
      const monthDiff = (real.year - fromYear) * 12 + (real.month - fromMonth);
      const canExecute = (real.year === toYear && real.month === toMonth);

      let statusType = 'preview';
      if (canExecute) {
        statusType = 'ready';
      } else if (monthDiff >= 2) {
        statusType = 'outdated';
      }

      const currentKey = toYmKey(fromYear, fromMonth);

      const studentPreviews = students.value
        .filter(s => !s.isUnreleased && s.isEdited)
        .map(s => {
          const buyCount = s.buyPlans?.[currentKey] || 0;
          const extraCount = s.extraPieces || 0;
          const totalAdded = buyCount + extraCount;

          const rankResult = calculateRankUp(s.currentGrade, s.currentPieces, totalAdded);
          const wasAchieved = s.currentGrade >= s.targetGrade;
          const willAchieve = rankResult.newGrade >= s.targetGrade;

          return {
            id: s.id,
            name: s.name,
            icon: s.icon,
            wikiIcon: s.wikiIcon,
            currentGradeText: getCompactGradeText(s.currentGrade),
            currentPieces: s.currentPieces || 0,
            targetGradeText: getCompactGradeText(s.targetGrade),
            buyCount,
            extraCount,
            totalAdded,
            newGrade: rankResult.newGrade,
            newGradeText: getCompactGradeText(rankResult.newGrade),
            newPieces: rankResult.newPieces,
            isRankedUp: rankResult.isRankedUp,
            wasAchieved,
            willAchieve,
            hasChange: totalAdded > 0
          };
        });

      return {
        fromYear,
        fromMonth,
        toYear,
        toMonth,
        carriedCoins,
        canExecute,
        statusType,
        monthDiff,
        realDate: real,
        studentPreviews
      };
    });

    // 繰越処理の確定実行
    const executeRollover = (force = false) => {
      const prev = rolloverPreview.value;
      if (!prev.canExecute && !force) {
        if (!confirm(`端末の日時（${prev.realDate.year}年${prev.realDate.month}月）はまだ設定月の翌月（${prev.toYear}年${prev.toMonth}月）ではありません。\nテスト・手動操作として${prev.toMonth}月へ繰越を実行しますか？`)) {
          return;
        }
      } else {
        if (!confirm(`${prev.toYear}年${prev.toMonth}月へ繰越処理を実行します。\n前月末残高(${formatNumber(prev.carriedCoins)}コイン)を引き継ぎ、星上げと購入予定を次月へ進めます。よろしいですか？`)) {
          return;
        }
      }

      const fromKey = toYmKey(prev.fromYear, prev.fromMonth);

      // 各生徒の星・文字数更新 ＆ 別途入手数リセット
      students.value.forEach(s => {
        if (!s.isUnreleased && s.isEdited) {
          const buyCount = s.buyPlans?.[fromKey] || 0;
          const extraCount = s.extraPieces || 0;
          const totalAdded = buyCount + extraCount;

          const rankResult = calculateRankUp(s.currentGrade, s.currentPieces, totalAdded);
          s.currentGrade = rankResult.newGrade;
          s.currentPieces = rankResult.newPieces;

          // 目標を超えたら目標も引き上げ
          if (s.currentGrade > s.targetGrade) {
            s.targetGrade = s.currentGrade;
          }

          s.extraPieces = 0; // 別途入手分リセット
        }
      });

      // 所持コイン・年月設定の更新 (buyPlansはキーがYYYY-MMなので新月に連動して自然にスライド)
      currentCoins.value = prev.carriedCoins;
      baseYear.value = prev.toYear;
      baseMonth.value = prev.toMonth;
      startMonth.value = prev.toMonth;
      startDay.value = Math.min(new Date(prev.toYear, prev.toMonth, 0).getDate(), prev.realDate.day || 1);
      displayMonthOffset.value = 0;

      isRolloverModalOpen.value = false;
      saveState();

      alert(`${prev.toMonth}月への繰越処理が完了しました！\n所持コイン: ${formatNumber(currentCoins.value)}コイン\n星上げと購入予定を更新しました。`);
    };

    const exportData = () => {
      const data = {
        version: 9,
        exportedAt: new Date().toISOString(),
        baseYear: baseYear.value,
        baseMonth: baseMonth.value,
        currentCoins: currentCoins.value,
        hasMonthly: hasMonthly.value,
        hasMonthlyHalf: hasMonthlyHalf.value,
        hideUnreleased: hideUnreleased.value,
        startMonth: startMonth.value,
        startDay: startDay.value,
        students: students.value.map(s => ({
          id: s.id,
          name: s.name,
          currentGrade: s.currentGrade,
          currentPieces: s.currentPieces,
          targetGrade: s.targetGrade,
          extraPieces: s.extraPieces || 0,
          buyPlans: s.buyPlans || {},
          isPinned: !!s.isPinned,
          isEdited: !!s.isEdited
        }))
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ブルアカ指名手配ショップ計画_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const importData = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.baseYear !== undefined) baseYear.value = imported.baseYear;
          if (imported.baseMonth !== undefined) baseMonth.value = imported.baseMonth;
          if (imported.currentCoins !== undefined) currentCoins.value = imported.currentCoins;
          if (imported.hasMonthly !== undefined) hasMonthly.value = imported.hasMonthly;
          if (imported.hasMonthlyHalf !== undefined) hasMonthlyHalf.value = imported.hasMonthlyHalf;
          if (imported.startMonth !== undefined) startMonth.value = imported.startMonth;
          if (imported.startDay !== undefined) startDay.value = imported.startDay;

          if (Array.isArray(imported.students)) {
            imported.students.forEach(imp => {
              const target = students.value.find(s => s.id === imp.id || s.name === imp.name);
              if (target) {
                if (imp.currentGrade !== undefined) target.currentGrade = imp.currentGrade;
                if (imp.currentPieces !== undefined) target.currentPieces = imp.currentPieces;
                if (imp.targetGrade !== undefined) target.targetGrade = imp.targetGrade;
                if (imp.extraPieces !== undefined) target.extraPieces = imp.extraPieces;
                if (imp.buyPlans) target.buyPlans = imp.buyPlans;
                if (imp.isPinned !== undefined) target.isPinned = imp.isPinned;
                if (imp.isEdited !== undefined) target.isEdited = imp.isEdited;
              }
            });
          }
          alert('設定データを正常に読み込みました！');
        } catch (err) {
          alert('ファイルの読み込みに失敗しました。正しいJSONファイルかご確認ください。');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    };

    const saveState = () => {
      const payload = {
        baseYear: baseYear.value,
        baseMonth: baseMonth.value,
        currentCoins: currentCoins.value,
        hasMonthly: hasMonthly.value,
        hasMonthlyHalf: hasMonthlyHalf.value,
        hideUnreleased: hideUnreleased.value,
        startMonth: startMonth.value,
        startDay: startDay.value,
        sortKey: sortKey.value,
        filterRole: filterRole.value,
        filterAttack: filterAttack.value,
        viewMode: viewMode.value,
        students: students.value.map(s => ({
          id: s.id,
          currentGrade: s.currentGrade,
          currentPieces: s.currentPieces,
          targetGrade: s.targetGrade,
          extraPieces: s.extraPieces || 0,
          buyPlans: s.buyPlans || {},
          isPinned: !!s.isPinned,
          isEdited: !!s.isEdited
        }))
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };

    const loadState = () => {
      try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          raw = localStorage.getItem('ba_wanted_shop_plan_v8') || localStorage.getItem('ba_wanted_shop_plan_v7');
        }
        if (!raw) {
          // 初回ロード時もハスミ(体操服)は固有4
          const hasumi = students.value.find(s => s.name === "ハスミ（体操服）");
          if (hasumi) {
            hasumi.currentGrade = 7;
            hasumi.targetGrade = 7;
          }
          return;
        }

        const parsed = JSON.parse(raw);
        if (parsed.baseYear !== undefined) baseYear.value = parsed.baseYear;
        if (parsed.baseMonth !== undefined) baseMonth.value = parsed.baseMonth;
        if (parsed.currentCoins !== undefined) currentCoins.value = parsed.currentCoins;
        if (parsed.hasMonthly !== undefined) hasMonthly.value = parsed.hasMonthly;
        if (parsed.hasMonthlyHalf !== undefined) hasMonthlyHalf.value = parsed.hasMonthlyHalf;
        if (parsed.hideUnreleased !== undefined) hideUnreleased.value = parsed.hideUnreleased;
        if (parsed.startMonth !== undefined) startMonth.value = parsed.startMonth;
        if (parsed.startDay !== undefined) startDay.value = parsed.startDay;
        if (parsed.sortKey) sortKey.value = parsed.sortKey;
        if (parsed.filterRole) filterRole.value = parsed.filterRole;
        if (parsed.filterAttack) filterAttack.value = parsed.filterAttack;
        if (parsed.viewMode) viewMode.value = parsed.viewMode;

        if (Array.isArray(parsed.students)) {
          parsed.students.forEach(saved => {
            const target = students.value.find(s => s.id === saved.id);
            if (target) {
              if (saved.currentGrade !== undefined) target.currentGrade = saved.currentGrade;
              if (saved.currentPieces !== undefined) target.currentPieces = saved.currentPieces;
              if (saved.targetGrade !== undefined) target.targetGrade = saved.targetGrade;
              if (saved.extraPieces !== undefined) target.extraPieces = saved.extraPieces;
              if (saved.buyPlans) target.buyPlans = saved.buyPlans;
              if (saved.isPinned !== undefined) target.isPinned = saved.isPinned;

              // 未追加生徒はショップ購入不可のためbuyPlansを空にする
              if (target.isUnreleased) {
                target.buyPlans = {};
              }

              // 旧データでハスミ(体操服)が初期デフォルト(星1→固有1)のままであれば固有4に自動補正
              if (target.name === "ハスミ（体操服）" && target.currentGrade === 0 && target.targetGrade === 4) {
                target.currentGrade = 7;
                target.targetGrade = 7;
              }

              if (saved.isEdited !== undefined) {
                target.isEdited = saved.isEdited;
              } else {
                // 旧保存データ向け：変更があれば編集済み、初期値のままなら未編集
                const hasBuys = saved.buyPlans && Object.values(saved.buyPlans).some(v => v > 0);
                const isDefaultGrade = target.name === "ハスミ（体操服）"
                  ? (target.currentGrade === 7 && target.targetGrade === 7)
                  : (target.currentGrade === 0 && target.targetGrade === 4);
                target.isEdited = !isDefaultGrade || ((target.currentPieces || 0) > 0) || hasBuys;
              }
            }
          });
        }
      } catch (e) {
        console.error('Failed to load state from localStorage', e);
      }
    };

    onMounted(() => {
      loadState();
    });

    watch(
      [currentCoins, hasMonthly, hasMonthlyHalf, hideUnreleased, baseYear, baseMonth, startMonth, startDay, sortKey, filterRole, filterAttack, viewMode, students],
      () => {
        saveState();
      },
      { deep: true }
    );

    return {
      baseYear,
      baseMonth,
      currentCoins,
      formattedCurrentCoins,
      hasMonthly,
      hasMonthlyHalf,
      startMonth,
      startDay,
      daysInSelectedMonth,
      displayMonthOffset,
      displayMonths,
      hasPastData,
      isShakingPrev,
      isShakingNext,
      canGoPrev,
      canGoNext,
      canGoNextSummary,
      prevMonth,
      nextMonth,
      nextMonthSummary,
      resetToCurrentMonth,
      togglePin,
      viewMode,
      isMobileView,
      hideUnreleased,
      sortKey,
      filterRole,
      filterAttack,
      filterStatus,
      searchQuery,
      students,
      dailyCoins,
      monthlyRateText,
      monthlyRateValue,
      totalRequiredPieces,
      totalRequiredCoins,
      monthsSummary,
      unreleasedCount,
      getRawRequiredPieces,
      getRequiredPieces,
      getRequiredPiecesDisplay,
      getRemainingPiecesDisplay,
      getGaugePercent,
      isMaxed,
      getRemainingAfterMonthIndex,
      canBuyMoreInMonth,
      increaseBuy,
      decreaseBuy,
      getBuyCount,
      onCurrentGradeChange,
      onTargetGradeChange,
      onCurrentPiecesChange,
      onExtraPiecesChange,
      onStudentEdit,
      onImageError,
      getCompactGradeText,
      formatNumber,
      filteredStudents,
      isBatchMenuOpen,
      toggleBatchMenu,
      closeBatchMenu,
      applyMaxBuy,
      clearAllBuys,
      setAllTarget,
      clearCurrentMonthBuys,
      confirmReset,
      isRolloverModalOpen,
      openRolloverModal,
      closeRolloverModal,
      rolloverPreview,
      executeRollover,
      exportData,
      importData
    };
  }
}).mount('#app');
